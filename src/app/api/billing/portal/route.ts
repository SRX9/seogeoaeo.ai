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

    // Prefer the dedicated portal configuration (plan switching between our
    // prices + cancel at period end), created via /api/admin/portal-config.
    // Without the secret, Stripe's default portal configuration is used.
    const configuration = process.env.STRIPE_PORTAL_CONFIG_ID;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${origin}/account?tab=billing`,
      ...(configuration ? { configuration } : {}),
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("portal error", error);
    return NextResponse.json({ error: "Unable to open customer portal" }, { status: 500 });
  }
}
