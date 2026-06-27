import type Stripe from "stripe";
import { getStripe } from "@/lib/billing/stripe";
import {
  markSubscriptionInactive,
  syncSubscriptionFromStripe,
} from "@/lib/billing/subscription";
import { getCreditPack } from "@/lib/billing/credits";
import { grantCredits } from "@/lib/usage/credits";
import { logInfo, logWarn } from "@/lib/logging/logger";

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
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      const workspaceId = checkoutSession.metadata?.workspaceId;

      // One-time credit pack purchase: add to the never-expiring bucket.
      if (checkoutSession.metadata?.type === "topup") {
        const packId = checkoutSession.metadata?.packId;
        const pack = packId ? getCreditPack(packId) : undefined;
        if (workspaceId && pack) {
          await grantCredits(workspaceId, pack.credits, {
            reason: "topup_purchase",
            bucket: "purchased",
            refType: "stripe_session",
            refId: checkoutSession.id,
          });
          logInfo("stripe.topup.completed", { workspaceId, packId, credits: pack.credits });
          return { handled: true, action: "checkout.session.completed.topup" };
        }
        logWarn("stripe.topup.missing_metadata", { eventId: event.id });
        return { handled: false };
      }

      const subscriptionId =
        typeof checkoutSession.subscription === "string"
          ? checkoutSession.subscription
          : checkoutSession.subscription?.id;

      if (workspaceId && subscriptionId) {
        const subscription = await retrieveSubscription(subscriptionId);
        await syncSubscriptionFromStripe(workspaceId, subscription);
        logInfo("stripe.checkout.completed", { workspaceId, subscriptionId });
        return { handled: true, action: "checkout.session.completed" };
      }

      logWarn("stripe.checkout.missing_metadata", { eventId: event.id });
      return { handled: false };
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
