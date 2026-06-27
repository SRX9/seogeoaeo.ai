import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { creditLedger, subscriptions } from "@/lib/db/schema";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
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

  await getDb()
    .update(subscriptions)
    .set({
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId:
        typeof stripeSubscription.customer === "string"
          ? stripeSubscription.customer
          : stripeSubscription.customer.id,
      status: stripeSubscription.status,
      planId: planId ?? "indie",
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
  if (active && grant > 0 && periodEnd) {
    await resetMonthlyCredits(workspaceId, grant, {
      refId: `${stripeSubscription.id}:${priceId}:${periodEnd}`,
      refType: "stripe_subscription",
    });
  }
}

export async function markSubscriptionInactive(workspaceId: string) {
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
        status: "inactive",
        stripeSubscriptionId: null,
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
