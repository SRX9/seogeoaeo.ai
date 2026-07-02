import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings, audits } from "@/lib/db/schema/visibility";
import { compareAudits, type DeltaReport } from "@/lib/visibility/compare";
import { createAudit, executeAudit } from "./run-audit";

/**
 * V7.3 — scheduled re-audits & alerts. A monthly (staggered) cron re-audits each
 * active site, stores a new run_version, computes the V6.3 delta, and alerts on a
 * score drop or a new Critical finding. Orchestration reuses V2.3 + V6.3.
 */

/** Drop threshold (points) below which a decline triggers an alert. */
export const DROP_THRESHOLD = 8;

export interface AlertDecision {
  alert: boolean;
  reasons: string[];
}

/** Pure alert rule: fire on a material overall drop or any new Critical finding. */
export function shouldAlert(delta: DeltaReport, newCriticalCount: number): AlertDecision {
  const reasons: string[] = [];
  if (delta.overall.delta <= -DROP_THRESHOLD) {
    reasons.push(`Overall visibility fell ${Math.abs(delta.overall.delta)} points.`);
  }
  if (newCriticalCount > 0) {
    reasons.push(`${newCriticalCount} new critical finding(s).`);
  }
  return { alert: reasons.length > 0, reasons };
}

export interface ReauditAlert {
  workspaceId: string;
  siteUrl: string;
  auditId: string;
  reasons: string[];
}

/**
 * Count criticals in the new audit that weren't already critical in the baseline
 * (matched by category + title), so a persistent critical doesn't re-alert every
 * cycle — only genuinely new ones do.
 */
async function countNewCriticals(baselineId: string, currentId: string): Promise<number> {
  const db = getDb();
  const key = (f: { category: string; title: string }) => `${f.category}::${f.title}`;
  const [baseline, current] = await Promise.all([
    db.select().from(auditFindings).where(eq(auditFindings.auditId, baselineId)),
    db.select().from(auditFindings).where(eq(auditFindings.auditId, currentId)),
  ]);
  const had = new Set(baseline.filter((f) => f.severity === "critical").map(key));
  return current.filter((f) => f.severity === "critical" && !had.has(key(f))).length;
}

/** Latest audit per (workspace, site) — the baseline for each re-audit. */
async function latestAuditPerSite() {
  const db = getDb();
  const rows = await db
    .select({ id: audits.id, workspaceId: audits.workspaceId, siteUrl: audits.siteUrl })
    .from(audits)
    .orderBy(desc(audits.createdAt));
  const seen = new Map<string, { id: string; workspaceId: string; siteUrl: string }>();
  for (const r of rows) {
    const key = `${r.workspaceId}::${r.siteUrl}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

/**
 * Re-audit every active site, compute the delta vs its previous run, and return
 * the sites that should alert. The caller sends the notifications (email/in-app).
 */
export async function reauditActiveSites(): Promise<ReauditAlert[]> {
  const db = getDb();
  const sites = await latestAuditPerSite();
  const alerts: ReauditAlert[] = [];

  for (const site of sites) {
    try {
      const newAuditId = await createAudit(site.workspaceId, site.siteUrl);
      await executeAudit(newAuditId, site.siteUrl);
      const delta = await compareAudits(site.id, newAuditId);
      const newCritical = await countNewCriticals(site.id, newAuditId);
      const decision = shouldAlert(delta, newCritical);
      if (decision.alert) {
        alerts.push({ workspaceId: site.workspaceId, siteUrl: site.siteUrl, auditId: newAuditId, reasons: decision.reasons });
      }
    } catch (error) {
      console.error(`[visibility] re-audit failed for ${site.siteUrl}`, error);
    }
  }
  return alerts;
}
