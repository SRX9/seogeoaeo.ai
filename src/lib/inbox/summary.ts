import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { articles } from "@/lib/db/schema/content";
import { agentApprovals } from "@/lib/db/schema";
import { trafficSnapshots } from "@/lib/db/schema/visibility";
import { listIntegrations } from "@/lib/integrations/repository";
import { getOpenFindings } from "@/lib/visibility/findings-repository";
import { countInboxFromParts } from "@/lib/inbox/rows";
import { isInstallReady } from "@/lib/visibility/fix-policy";

/**
 * Cheap server-side inbox badge count — no article bodies, no full traffic series.
 * Semantics match `buildInboxRows` / the owner Inbox UI.
 */
export async function getInboxSummaryCount(scope: BrandScope): Promise<number> {
  const db = getDb();
  const [draftRow, findings, gscSnap, integrations, approvalRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(articles)
      .where(and(eq(articles.brandId, scope.brandId), eq(articles.status, "draft"))),
    getOpenFindings(scope.workspaceId, { brandId: scope.brandId }),
    db
      .select({ id: trafficSnapshots.id })
      .from(trafficSnapshots)
      .where(
        and(eq(trafficSnapshots.brandId, scope.brandId), eq(trafficSnapshots.source, "gsc")),
      )
      .limit(1),
    listIntegrations(scope.brandId),
    db
      .select({ n: count() })
      .from(agentApprovals)
      .where(
        and(
          eq(agentApprovals.brandId, scope.brandId),
          eq(agentApprovals.status, "pending"),
          or(isNull(agentApprovals.expiresAt), gt(agentApprovals.expiresAt, new Date())),
        ),
      ),
  ]);

  const draftCount = Number(draftRow[0]?.n ?? 0);
  const approvableFixCount = findings.filter((f) => isInstallReady(f.fixCapability)).length;

  return Number(approvalRow[0]?.n ?? 0) + countInboxFromParts({
    draftCount,
    approvableFixCount,
    gscConnected: gscSnap.length > 0,
    hasIntegrations: integrations.length > 0,
    anyIntegrationEnabled: integrations.some((i) => i.enabled),
  });
}
