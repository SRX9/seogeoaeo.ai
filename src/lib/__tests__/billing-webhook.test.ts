import { describe, expect, it, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/billing/subscription", () => ({
  syncSubscriptionFromStripe: vi.fn(),
  markSubscriptionInactive: vi.fn(),
}));

import {
  markSubscriptionInactive,
  syncSubscriptionFromStripe,
} from "@/lib/billing/subscription";
import { processStripeWebhookEvent } from "@/lib/billing/webhook";

describe("stripe webhook handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("syncs subscription updates when workspace metadata is present", async () => {
    const result = await processStripeWebhookEvent({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          metadata: { workspaceId: "ws-1" },
          status: "active",
          customer: "cus_123",
          items: {
            data: [
              {
                price: { id: "price_test" },
                current_period_end: 1_700_000_000,
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event);

    expect(result.handled).toBe(true);
    expect(syncSubscriptionFromStripe).toHaveBeenCalled();
    expect(result.action).toBe("customer.subscription.updated");
  });

  it("marks subscription inactive on delete", async () => {
    const result = await processStripeWebhookEvent({
      id: "evt_2",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_123",
          metadata: { workspaceId: "ws-1" },
          status: "canceled",
          customer: "cus_123",
          items: { data: [] },
        },
      },
    } as unknown as Stripe.Event);

    expect(result.handled).toBe(true);
    expect(markSubscriptionInactive).toHaveBeenCalledWith("ws-1");
    expect(result.action).toBe("customer.subscription.deleted");
  });

  it("retrieves checkout subscription when metadata is complete", async () => {
    let retrieved = "";
    const result = await processStripeWebhookEvent(
      {
        id: "evt_3",
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { workspaceId: "ws-1" },
            subscription: "sub_123",
          },
        },
      } as unknown as Stripe.Event,
      {
        retrieveSubscription: async (subscriptionId) => {
          retrieved = subscriptionId;
          return {
            id: subscriptionId,
            metadata: { workspaceId: "ws-1" },
            status: "active",
            customer: "cus_123",
            items: {
              data: [
                {
                  price: { id: "price_test" },
                  current_period_end: 1_700_000_000,
                },
              ],
            },
          } as unknown as Stripe.Subscription;
        },
      },
    );

    expect(retrieved).toBe("sub_123");
    expect(result.handled).toBe(true);
    expect(syncSubscriptionFromStripe).toHaveBeenCalledWith("ws-1", expect.objectContaining({ id: "sub_123" }));
  });
});
