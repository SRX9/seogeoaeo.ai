import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import {
  markSubscriptionInactive,
  setStripeCustomerId,
  syncSubscriptionFromStripe,
} from "@/lib/billing/subscription";
import { getCreditPack } from "@/lib/billing/credits";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { igniteWorkspaceSetupRuns } from "@/lib/jobs/setup-run";
import { grantCredits } from "@/lib/usage/credits";
import { logInfo, logWarn } from "@/lib/logging/logger";

/**
 * Kick Setup Runs in the background so the webhook responds within Stripe's
 * timeout. `waitUntil` keeps the work alive after the response; without it
 * (tests, node) we fall back to fire-and-forget.
 */
function igniteInBackground(workspaceId: string): void {
  const work = igniteWorkspaceSetupRuns(workspaceId).catch((error) => {
    logWarn("stripe.setup_run_ignite_failed", {
      workspaceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  });
  const ctx = getCloudflareRequestContext()?.ctx as
    | { waitUntil?: (promise: Promise<unknown>) => void }
    | undefined;
  if (ctx?.waitUntil) ctx.waitUntil(work);
}

export type WebhookHandlerResult = {
  handled: boolean;
  action?: string;
};

type WebhookDeps = {
  retrieveSubscription?: (subscriptionId: string) => Promise<Stripe.Subscription>;
};

export async function processStripeWebhookEvent(
  event: Stripe.Event,
  deps: WebhookDeps = {},
): Promise<WebhookHandlerResult> {
  const retrieveSubscription =
    deps.retrieveSubscription ??
    ((subscriptionId: string) => getStripe().subscriptions.retrieve(subscriptionId));

  switch (event.type) {
    // async_payment_succeeded is the settlement event for delayed-notification
    // methods (bank debits, some wallets): `completed` fires first with
    // payment_status "unpaid" and is deferred below, then this event lands once
    // the money actually arrives. Same idempotent apply path for both.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      return applyCompletedCheckoutSession(checkoutSession, { retrieveSubscription });
    }
    case "checkout.session.async_payment_failed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      // Nothing was granted (the topup grant requires payment_status "paid"),
      // so there's nothing to claw back — just leave a trace for support.
      logWarn("stripe.checkout.async_payment_failed", {
        sessionId: checkoutSession.id,
        workspaceId: checkoutSession.metadata?.workspaceId,
      });
      return { handled: true, action: event.type };
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata.workspaceId;
      if (workspaceId) {
        await syncSubscriptionFromStripe(workspaceId, subscription);
        logInfo("stripe.subscription.synced", { workspaceId, status: subscription.status });
        return { handled: true, action: event.type };
      }
      return { handled: false };
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const workspaceId = subscription.metadata.workspaceId;
      if (workspaceId) {
        await markSubscriptionInactive(workspaceId);
        logInfo("stripe.subscription.deleted", { workspaceId });
        return { handled: true, action: event.type };
      }
      return { handled: false };
    }
    default:
      return { handled: false };
  }
}

/**
 * Apply a completed Checkout Session: grant top-up credits or sync the new
 * subscription (and ignite Setup Runs). Shared by the webhook and by
 * `/api/billing/checkout/confirm` (the browser's return from Stripe), so
 * activation is correct no matter which path lands first — the credit grant
 * dedupes on the session id and the subscription sync is a plain upsert.
 */
export async function applyCompletedCheckoutSession(
  checkoutSession: Stripe.Checkout.Session,
  deps: WebhookDeps = {},
): Promise<WebhookHandlerResult> {
  const retrieveSubscription =
    deps.retrieveSubscription ??
    ((subscriptionId: string) => getStripe().subscriptions.retrieve(subscriptionId));
  const workspaceId = checkoutSession.metadata?.workspaceId;

  // One-time credit pack purchase: add to the never-expiring bucket.
  if (checkoutSession.metadata?.type === "topup") {
    // Delayed-notification payment methods complete the session before the
    // money settles. Never grant credits on an unpaid session — the
    // async_payment_succeeded webhook re-enters here once it's actually paid.
    if (checkoutSession.payment_status !== "paid") {
      logInfo("stripe.topup.awaiting_payment", {
        sessionId: checkoutSession.id,
        paymentStatus: checkoutSession.payment_status,
      });
      return { handled: true, action: "checkout.session.completed.topup.awaiting_payment" };
    }
    const packId = checkoutSession.metadata?.packId;
    const pack = packId ? getCreditPack(packId) : undefined;
    if (workspaceId && pack) {
      await grantCredits(workspaceId, pack.credits, {
        reason: "topup_purchase",
        bucket: "purchased",
        refType: "stripe_session",
        refId: checkoutSession.id,
      });
      // Checkout may have created the customer (first-time buyer with no saved
      // id) — persist it so future purchases reuse the same customer.
      const customerId =
        typeof checkoutSession.customer === "string"
          ? checkoutSession.customer
          : checkoutSession.customer?.id;
      if (customerId) {
        await setStripeCustomerId(workspaceId, customerId);
      }
      logInfo("stripe.topup.completed", { workspaceId, packId, credits: pack.credits });
      return { handled: true, action: "checkout.session.completed.topup" };
    }
    logWarn("stripe.topup.missing_metadata", { sessionId: checkoutSession.id });
    return { handled: false };
  }

  const subscriptionId =
    typeof checkoutSession.subscription === "string"
      ? checkoutSession.subscription
      : checkoutSession.subscription?.id;

  if (workspaceId && subscriptionId) {
    const subscription = await retrieveSubscription(subscriptionId);
    await syncSubscriptionFromStripe(workspaceId, subscription);
    // AP2 ignition: never depend on the client's fire-and-forget POST —
    // startSetupRun is idempotent, so a duplicate trigger is a no-op. Only for
    // paid sessions: an async payment method's unpaid `completed` event must
    // not start credit-spending setup work; async_payment_succeeded re-enters.
    if (checkoutSession.payment_status === "paid") {
      igniteInBackground(workspaceId);
    }
    logInfo("stripe.checkout.completed", { workspaceId, subscriptionId });
    return { handled: true, action: "checkout.session.completed" };
  }

  logWarn("stripe.checkout.missing_metadata", { sessionId: checkoutSession.id });
  return { handled: false };
}
