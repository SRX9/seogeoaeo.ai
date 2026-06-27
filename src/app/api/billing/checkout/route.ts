import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getPlan, getStripePriceId, type PlanId } from "@/lib/billing/plans";
import {
  getCreditPack,
  getPackStripePriceId,
  type CreditPackId,
} from "@/lib/billing/credits";
import { getBillingContext, getRequestOrigin } from "@/lib/billing/access";
import { getStripe } from "@/lib/billing/stripe";
import { setStripeCustomerId } from "@/lib/billing/subscription";

type CheckoutBody = { planId?: PlanId; packId?: CreditPackId };

/**
 * Start a Stripe Checkout session. `planId` opens a recurring subscription;
 * `packId` opens a one-time payment for a credit top-up pack.
 */
export async function POST(request: Request) {
  try {
    const { planId, packId }: CheckoutBody = await request.json();
    if (!planId && !packId) {
      return NextResponse.json({ error: "planId or packId is required" }, { status: 400 });
    }

    const { session, workspace, subscription } = await getBillingContext();
    const stripe = getStripe();
    const origin = await getRequestOrigin();

    let customerId = subscription?.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: session.user.email,
        metadata: {
          workspaceId: workspace.id,
          userId: session.user.id,
        },
      });
      customerId = customer.id;
      await setStripeCustomerId(workspace.id, customerId);
    }

    const successUrl = `${origin}/settings?tab=billing&checkout=success`;
    const cancelUrl = `${origin}/settings?tab=billing&checkout=canceled`;

    let params: Stripe.Checkout.SessionCreateParams;

    if (packId) {
      const pack = getCreditPack(packId);
      const packPriceId = getPackStripePriceId(packId);
      if (!pack || !packPriceId) {
        return NextResponse.json({ error: "Pack is not configured" }, { status: 400 });
      }
      params = {
        mode: "payment",
        customer: customerId,
        line_items: [{ price: packPriceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: "topup",
          workspaceId: workspace.id,
          userId: session.user.id,
          packId: pack.id,
          credits: String(pack.credits),
        },
      };
    } else {
      const plan = getPlan(planId!);
      const stripePriceId = getStripePriceId(planId!);
      if (!plan || !stripePriceId) {
        return NextResponse.json({ error: "Plan is not configured" }, { status: 400 });
      }
      params = {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: stripePriceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          workspaceId: workspace.id,
          userId: session.user.id,
          planId: plan.id,
        },
        subscription_data: {
          metadata: {
            workspaceId: workspace.id,
            planId: plan.id,
          },
        },
      };
    }

    const checkoutSession = await stripe.checkout.sessions.create(params);

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "Checkout URL missing" }, { status: 500 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("checkout error", error);
    return NextResponse.json({ error: "Unable to start checkout" }, { status: 500 });
  }
}
