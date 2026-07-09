import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { creditLedger, subscriptions } from "@/lib/db/schema";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  FREE_PLAN_ID,
  getPlan,
  planFromStripePriceId,
  type PlanId,
} from "@/lib/billing/plans";
import { resetMonthlyCredits } from "@/lib/usage/credits";
import { logWarn } from "@/lib/logging/logger";

export async function syncSubscriptionFromStripe(
  workspaceId: string,
  stripeSubscription: Stripe.Subscription,
) {
  const item = stripeSubscription.items.data[0];
  const priceId = item?.price.id;
  // `current_period_end` lives on the subscription item in current Stripe API
  // versions; it advances at each renewal.
  const periodEnd = item?.current_period_end;
  const planId = priceId ? planFromStripePriceId(priceId) : null;
  const plan = planId ? getPlan(planId) : null;
  const grant = plan?.monthlyCredits ?? 0;
  const active = ACTIVE_SUBSCRIPTION_STATUSES.has(stripeSubscription.status);

  // A paid subscription whose price we can't map means a misconfigured
  // STRIPE_PRICE_* env — the customer would silently be granted zero credits.
  // Surface it loudly instead of failing quietly.
  if (active && !plan) {
    logWarn("stripe.subscription.unmapped_price", { workspaceId, priceId });
  }

  // Non-active statuses (canceled, unpaid, past_due, …) must not keep paid
  // plan caps or monthly credits. Purchased credits never expire.
  if (!active) {
    await markSubscriptionInactive(workspaceId, {
      status: stripeSubscription.status,
      keepStripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId:
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer.id,
    });
    return;
  }

  // Never invent "indie" for an unmapped price — leave the prior planId and
  // grant nothing until env is fixed.
  const resolvedPlanId = planId ?? undefined;

  await getDb()
    .update(subscriptions)
    .set({
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId:
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer.id,
      status: stripeSubscription.status,
      ...(resolvedPlanId ? { planId: resolvedPlanId } : {}),
      monthlyCreditGrant: grant,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.workspaceId, workspaceId));

  // Refill the monthly bucket. The refId is keyed on subscription + price +
  // period, so it's a no-op within a billing cycle but fires once per renewal
  // (period advances) and once per plan change (price changes). resetMonthlyCredits
  // dedups on this refId under a row lock, so duplicate/out-of-order webhooks can't
  // double-grant — and because nothing here pre-empts the call, a transiently
  // failed refill is simply retried by Stripe rather than lost.
  if (grant > 0 && periodEnd && planId) {
    await resetMonthlyCredits(workspaceId, grant, {
      refId: `${stripeSubscription.id}:${priceId}:${periodEnd}`,
      refType: "stripe_subscription",
    });
  }
}

type InactiveOptions = {
  status?: string;
  keepStripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
};

export async function markSubscriptionInactive(
  workspaceId: string,
  options: InactiveOptions = {},
) {
  await getDb().transaction(async (tx) => {
    const [sub] = await tx
      .select({
        id: subscriptions.id,
        monthly: subscriptions.monthlyCredits,
        purchased: subscriptions.purchasedCredits,
      })
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, workspaceId))
      .for("update")
      .limit(1);
    if (!sub) return;

    await tx
      .update(subscriptions)
      .set({
        status: options.status ?? "inactive",
        // Drop paid plan caps so visibility gates stop treating them as entitled.
        planId: FREE_PLAN_ID,
        stripeSubscriptionId: options.keepStripeSubscriptionId ?? null,
        ...(options.stripeCustomerId
          ? { stripeCustomerId: options.stripeCustomerId }
          : {}),
        // Monthly credits are plan-bound and don't survive cancellation;
        // purchased credits never expire and are left untouched.
        monthlyCredits: 0,
        monthlyCreditGrant: 0,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    if (sub.monthly > 0) {
      await tx.insert(creditLedger).values({
        workspaceId,
        delta: -sub.monthly,
        balanceAfter: sub.purchased,
        reason: "monthly_expire",
        refType: "stripe_subscription",
      });
    }
  });
}

export async function setStripeCustomerId(workspaceId: string, customerId: string) {
  await getDb()
    .update(subscriptions)
    .set({
      stripeCustomerId: customerId,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.workspaceId, workspaceId));
}

export function resolvePlanId(metadataPlanId: string | undefined): PlanId {
  const plan = metadataPlanId ? getPlan(metadataPlanId) : undefined;
  return plan?.id ?? "indie";
}
