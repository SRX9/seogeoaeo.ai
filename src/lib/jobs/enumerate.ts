import { eq } from "drizzle-orm";
import { isActiveSubscription } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { subscriptions, workspaces } from "@/lib/db/schema";

/**
 * Workspaces whose subscription entitles them to the daily content agent. One
 * row per active subscription; the daily cron fans these out into per-brand
 * Workflow instances.
 */
export async function listActiveWorkspaceIds() {
  const rows = await getDb()
    .select({
      workspaceId: workspaces.id,
      status: subscriptions.status,
      planId: subscriptions.planId,
    })
    .from(workspaces)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id));

  // Dedupe defensively: a workspace with multiple subscription rows must not
  // enumerate its brands twice (harmless via instance-id idempotency, but noisy).
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!isActiveSubscription(row.status) || seen.has(row.workspaceId)) return false;
    seen.add(row.workspaceId);
    return true;
  });
}
