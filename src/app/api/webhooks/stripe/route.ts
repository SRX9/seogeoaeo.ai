import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { processStripeWebhookEvent } from "@/lib/billing/webhook";
import { getStripe } from "@/lib/billing/stripe";
import { logError } from "@/lib/logging/logger";

export async function POST(request: Request) {
  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    logError("stripe.webhook.invalid_signature", {
      error: error instanceof Error ? error.message : "Invalid signature",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await processStripeWebhookEvent(event);
  } catch (error) {
    logError("stripe.webhook.handler_failed", {
      eventType: event.type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
