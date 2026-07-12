// One-time admin setup: create a Stripe Customer Portal configuration that lets
// subscribers switch between our plan prices (with proration) and cancel at
// period end. Gated behind CRON_SECRET like the other internal endpoints.
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     https://seogeoaeo.ai/api/admin/portal-config
//
// Optional JSON body `{ "priceIds": ["price_...", ...] }` overrides the default
// list (the four STRIPE_PRICE_* plan prices). The response's `configurationId`
// (bpc_...) goes into the STRIPE_PORTAL_CONFIG_ID secret, which
// /api/billing/portal then passes so every portal session uses this config.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripePriceId, plans, type PlanId } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { isCronAuthorized } from "@/lib/cron/auth";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { priceIds?: string[] };
    const priceIds =
      body.priceIds && body.priceIds.length > 0
        ? body.priceIds
        : (Object.keys(plans) as PlanId[])
            .map((planId) => getStripePriceId(planId))
            .filter((id): id is string => Boolean(id));

    if (priceIds.length === 0) {
      return NextResponse.json(
        { error: "No price ids: set the STRIPE_PRICE_* secrets or pass priceIds" },
        { status: 400 },
      );
    }

    const stripe = getStripe();

    // The portal's subscription_update feature wants prices grouped by product.
    const prices = await Promise.all(priceIds.map((priceId) => stripe.prices.retrieve(priceId)));
    const productPrices = new Map<string, string[]>();
    for (const price of prices) {
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      productPrices.set(productId, [...(productPrices.get(productId) ?? []), price.id]);
    }

    const configuration = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "Manage your seogeoaeo.ai subscription",
      },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price", "promotion_code"],
          proration_behavior: "create_prorations",
          products: [...productPrices.entries()].map(
            ([product, prices]): Stripe.BillingPortal.ConfigurationCreateParams.Features.SubscriptionUpdate.Product => ({
              product,
              prices,
            }),
          ),
        },
      },
    });

    return NextResponse.json({
      configurationId: configuration.id,
      priceIds,
      note: "Set this id as the STRIPE_PORTAL_CONFIG_ID secret.",
    });
  } catch (error) {
    console.error("portal config error", error);
    const message = error instanceof Error ? error.message : "Unable to create portal configuration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
