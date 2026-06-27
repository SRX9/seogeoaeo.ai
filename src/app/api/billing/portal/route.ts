import { NextResponse } from "next/server";
import { getBillingContext, getRequestOrigin } from "@/lib/billing/access";
import { getStripe } from "@/lib/billing/stripe";

export async function POST() {
  try {
    const { subscription } = await getBillingContext();

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ error: "No billing customer found" }, { status: 400 });
    }

    const stripe = getStripe();
    const origin = await getRequestOrigin();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${origin}/settings?tab=billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("portal error", error);
    return NextResponse.json({ error: "Unable to open customer portal" }, { status: 500 });
  }
}
