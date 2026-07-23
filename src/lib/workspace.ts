import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { FREE_PLAN_ID } from "@/lib/billing/plans";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits";
import { creditLedger, subscriptions, user, workspaces } from "@/lib/db/schema";

export async function ensureUserWorkspace(ownerId: string, name: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    // The owner id is unique. A no-op conflict update makes concurrent signup
    // hooks converge on the same row and still gives us the workspace id.
    const [workspace] = await tx
      .insert(workspaces)
      .values({ ownerId, name: name || "My workspace" })
      .onConflictDoUpdate({ target: workspaces.ownerId, set: { ownerId } })
      .returning();

    // Repair a historical/partially provisioned workspace as well as creating
    // a new one. Stripe subscription sync uses an UPDATE, so this row is a hard
    // invariant before checkout is allowed to start.
    const insertedSubscriptions = await tx.insert(subscriptions).values({
      workspaceId: workspace.id,
      status: "inactive",
      planId: FREE_PLAN_ID,
      purchasedCredits: SIGNUP_GRANT_CREDITS,
    }).onConflictDoNothing({ target: subscriptions.workspaceId }).returning({ id: subscriptions.id });

    if (insertedSubscriptions.length > 0) {
      await tx.insert(creditLedger).values({
        workspaceId: workspace.id,
        delta: SIGNUP_GRANT_CREDITS,
        balanceAfter: SIGNUP_GRANT_CREDITS,
        reason: "signup_grant",
        refType: "workspace",
        refId: workspace.id,
      }).onConflictDoNothing();
    }

    return workspace;
  });
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

export type ClaudiaEmailPreferences = {
  milestoneEmailsEnabled: boolean;
  reviewEmailsEnabled: boolean;
  dailySummaryEmailsEnabled: boolean;
};

export type OwnerEmailPreferences = Partial<ClaudiaEmailPreferences> & {
  creditEmailsEnabled?: boolean;
};

/** Atomically update workspace- and subscription-scoped email preferences. */
export async function setOwnerEmailPreferences(
  workspaceId: string,
  preferences: OwnerEmailPreferences,
) {
  const {
    creditEmailsEnabled,
    milestoneEmailsEnabled,
    reviewEmailsEnabled,
    dailySummaryEmailsEnabled,
  } = preferences;
  const claudiaPreferences = {
    ...(milestoneEmailsEnabled === undefined ? {} : { milestoneEmailsEnabled }),
    ...(reviewEmailsEnabled === undefined ? {} : { reviewEmailsEnabled }),
    ...(dailySummaryEmailsEnabled === undefined ? {} : { dailySummaryEmailsEnabled }),
  };

  await getDb().transaction(async (tx) => {
    if (Object.keys(claudiaPreferences).length > 0) {
      await tx
        .update(workspaces)
        .set({ ...claudiaPreferences, updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));
    }
    if (creditEmailsEnabled !== undefined) {
      await tx
        .update(subscriptions)
        .set({ creditEmailsEnabled, updatedAt: new Date() })
        .where(eq(subscriptions.workspaceId, workspaceId));
    }
  });
}

/** Update any subset of Claudia's workspace-level email preferences. */
export async function setClaudiaEmailPreferences(
  workspaceId: string,
  preferences: Partial<ClaudiaEmailPreferences>,
) {
  if (Object.keys(preferences).length === 0) return;
  await setOwnerEmailPreferences(workspaceId, preferences);
}

/** Read Claudia's communication preferences, defaulting on for legacy rows. */
export async function getClaudiaEmailPreferences(
  workspaceId: string,
): Promise<ClaudiaEmailPreferences> {
  const [row] = await getDb()
    .select({
      milestoneEmailsEnabled: workspaces.milestoneEmailsEnabled,
      reviewEmailsEnabled: workspaces.reviewEmailsEnabled,
      dailySummaryEmailsEnabled: workspaces.dailySummaryEmailsEnabled,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return {
    milestoneEmailsEnabled: row?.milestoneEmailsEnabled ?? true,
    reviewEmailsEnabled: row?.reviewEmailsEnabled ?? true,
    dailySummaryEmailsEnabled: row?.dailySummaryEmailsEnabled ?? true,
  };
}

/** Toggle the owner's low/out-of-credits email notifications for a workspace. */
export async function setCreditEmailsEnabled(workspaceId: string, enabled: boolean) {
  await setOwnerEmailPreferences(workspaceId, { creditEmailsEnabled: enabled });
}

/** Email address of the workspace owner (workspaces.ownerId → user.email). */
export async function getWorkspaceOwnerEmail(workspaceId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ email: user.email })
    .from(workspaces)
    .innerJoin(user, eq(user.id, workspaces.ownerId))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row?.email ?? null;
}
