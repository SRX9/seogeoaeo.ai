import { NextResponse } from "next/server";
import { getBillingContext } from "@/lib/billing/access";
import { getStripe } from "@/lib/billing/stripe";
import { applyCompletedCheckoutSession } from "@/lib/billing/webhook";

/**
 * Confirm a Checkout Session straight from the browser's return redirect
 * (`?session_id={CHECKOUT_SESSION_ID}`), instead of waiting for the
 * `checkout.session.completed` webhook. Applies the same idempotent logic as
 * the webhook, so whichever path lands first wins and the other is a no-op.
 * this removes the "polling for the webhook" wait after payment.
 */
export async function POST(request: Request) {
  try {
    const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: string };
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const { workspace } = await getBillingContext();
    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId);

    // Only the workspace that started the checkout may confirm it.
    if (checkoutSession.metadata?.workspaceId !== workspace.id) {
      return NextResponse.json({ error: "Checkout session not found" }, { status: 404 });
    }

    // Unpaid/expired sessions (user backed out) simply aren't activated yet.
    if (checkoutSession.status !== "complete") {
      return NextResponse.json({ activated: false, status: checkoutSession.status });
    }

    const result = await applyCompletedCheckoutSession(checkoutSession);
    return NextResponse.json({ activated: result.handled });
  } catch (error) {
    console.error("checkout confirm error", error);
    return NextResponse.json({ error: "Unable to confirm checkout" }, { status: 500 });
  }
}
