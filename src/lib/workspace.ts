import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { FREE_PLAN_ID } from "@/lib/billing/plans";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits";
import { creditLedger, subscriptions, workspaces } from "@/lib/db/schema";
import type { AutonomyMode } from "@/lib/workspace/settings";

export async function ensureUserWorkspace(ownerId: string, name: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerId, ownerId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [workspace] = await db
    .insert(workspaces)
    .values({
      ownerId,
      name: name || "My workspace",
    })
    .returning();

  // No plan is purchased yet. Status drives publishing entitlement, while a
  // one-time signup grant of credits (never-expiring bucket) lets new users
  // generate their first article before subscribing. The Stripe webhook fills
  // in the real plan + monthly credits at checkout.
  await db.insert(subscriptions).values({
    workspaceId: workspace.id,
    status: "inactive",
    planId: FREE_PLAN_ID,
    purchasedCredits: SIGNUP_GRANT_CREDITS,
  });

  await db.insert(creditLedger).values({
    workspaceId: workspace.id,
    delta: SIGNUP_GRANT_CREDITS,
    balanceAfter: SIGNUP_GRANT_CREDITS,
    reason: "signup_grant",
    refType: "workspace",
    refId: workspace.id,
  });

  return workspace;
}

export async function getWorkspaceWithSubscription(ownerId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      workspace: workspaces,
      subscription: subscriptions,
    })
    .from(workspaces)
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .where(eq(workspaces.ownerId, ownerId))
    .limit(1);

  if (!row?.workspace) {
    return null;
  }

  return {
    workspace: row.workspace,
    subscription: row.subscription,
  };
}

export async function getWorkspaceById(workspaceId: string) {
  const [workspace] = await getDb()
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return workspace ?? null;
}

export async function updateWorkspaceAutonomy(workspaceId: string, autonomyMode: AutonomyMode) {
  const [workspace] = await getDb()
    .update(workspaces)
    .set({ autonomyMode, updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  return workspace;
}
