import { headers } from "next/headers";
import { requireSession } from "@/lib/auth/session";
import { getWorkspaceWithSubscription } from "@/lib/workspace";

/**
 * Resolve the current session, workspace, and subscription without gating.
 * The app is browsable on the free tier, so this never redirects — callers that
 * need an active plan (e.g. article generation) check `isActiveSubscription`
 * themselves and send the user to billing with a clear message.
 */
export async function getBillingContext() {
  if (process.env.AUTH_DEV_BYPASS === "true") {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  }

  const session = await requireSession();
  const workspace = await getWorkspaceWithSubscription(session.user.id);

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  return { session, ...workspace };
}

export async function getRequestOrigin() {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : (process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
}
