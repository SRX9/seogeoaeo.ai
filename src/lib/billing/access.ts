import { headers } from "next/headers";
import { isAuthDevBypass, requireSession } from "@/lib/auth/session";
import { getWorkspaceWithSubscription } from "@/lib/workspace";

/**
 * Resolve the current session, workspace, and subscription without gating.
 * The app is browsable on the free tier, so this never redirects: callers that
 * need an active plan (e.g. article generation) check `isActiveSubscription`
 * themselves and send the user to billing with a clear message.
 */
export async function getBillingContext() {
  if (isAuthDevBypass()) {
    const session = await requireSession();
    return {
      session,
      workspace: {
        id: "dev-workspace",
        ownerId: session.user.id,
        name: "Dev workspace",
        autonomyMode: "FULL_AUTO",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      subscription: {
        id: "dev-subscription",
        workspaceId: "dev-workspace",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        planId: "startup",
        status: "active",
        weeklyArticleCap: 0,
        monthlyCredits: 5000,
        purchasedCredits: 0,
        monthlyCreditGrant: 5000,
        creditsRefreshedAt: null,
        currentPeriodEnd: null,
        lastLowCreditEmailAt: null,
        creditEmailsEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  }

  const session = await requireSession();
  let workspace = await getWorkspaceWithSubscription(session.user.id);

  // Signup can race or partially fail. Repair on demand so checkout never
  // starts without the subscription row that Stripe synchronization updates.
  if (!workspace?.subscription) {
    const { ensureUserWorkspace } = await import("@/lib/workspace");
    await ensureUserWorkspace(session.user.id, session.user.name);
    workspace = await getWorkspaceWithSubscription(session.user.id);
  }

  if (!workspace?.subscription) {
    throw new Error("Workspace subscription could not be provisioned");
  }

  return { session, ...workspace };
}

export async function getRequestOrigin() {
  // In production, redirect targets (Stripe success/cancel URLs) must come from
  // config, never from client-influenceable headers like x-forwarded-host.
  const configured = process.env.BETTER_AUTH_URL;
  if (process.env.NODE_ENV === "production" && configured) {
    return configured.replace(/\/$/, "");
  }
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : (configured ?? "http://localhost:3000");
}
