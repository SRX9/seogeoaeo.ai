import { and, desc, eq, inArray } from "drizzle-orm";
import { ACTIVE_SUBSCRIPTION_STATUSES, visibilityCapsForPlan } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { auditFindings, audits } from "@/lib/db/schema/visibility";
import { brandProfiles, brands } from "@/lib/db/schema/brand";
import { dueForReaudit } from "@/lib/jobs/visibility-agent";
import { apexDomain } from "@/lib/visibility/answers";
import { applyFix } from "@/lib/visibility/apply-fix";
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
 * V8.5 — the ongoing autonomy loop. After a scheduled re-audit, brands in
 * FULL_AUTO get their `auto`-capable findings applied immediately (up to the
 * plan's autoFixCap); REVIEW brands keep them queued for one-click approval.
 * Best-effort per finding — a failed fix never fails the re-audit.
 */
async function autoApplyFixes(
  workspaceId: string,
  siteUrl: string,
  auditId: string,
  autoFixCap: number,
): Promise<number> {
  if (autoFixCap <= 0) return 0;
  const db = getDb();
  // The site's brand: same workspace, profile website on the same apex domain.
  const brandRows = await db
    .select({ autonomyMode: brands.autonomyMode, website: brandProfiles.website })
    .from(brands)
    .innerJoin(brandProfiles, eq(brandProfiles.brandId, brands.id))
    .where(eq(brands.workspaceId, workspaceId));
  const brand = brandRows.find((b) => b.website && apexDomain(b.website) === apexDomain(siteUrl));
  if (!brand || brand.autonomyMode !== "FULL_AUTO") return 0;

  const findings = await db
    .select({ id: auditFindings.id })
    .from(auditFindings)
    .where(
      and(
        eq(auditFindings.auditId, auditId),
        eq(auditFindings.fixCapability, "auto"),
        eq(auditFindings.isResolved, false),
      ),
    )
    .limit(autoFixCap);

  let applied = 0;
  for (const finding of findings) {
    try {
      await applyFix(finding.id, workspaceId);
      applied += 1;
    } catch (error) {
      console.error(`[visibility] auto-fix failed for finding ${finding.id}`, error);
    }
  }
  return applied;
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

/**
 * Latest owned audit per (workspace, site) — the baseline for each re-audit.
 * Scoped in SQL (DISTINCT ON, not a full-table scan into Worker memory) to:
 * - kind = "owned": competitor benchmark audits are one-off comparisons, never
 *   re-audited on cadence;
 * - an active subscription: churned/free workspaces stop consuming re-audit
 *   budget the day they lapse.
 */
async function latestAuditPerSite() {
  const db = getDb();
  return db
    .selectDistinctOn([audits.workspaceId, audits.siteUrl], {
      id: audits.id,
      workspaceId: audits.workspaceId,
      siteUrl: audits.siteUrl,
      createdAt: audits.createdAt,
      planId: subscriptions.planId,
    })
    .from(audits)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, audits.workspaceId))
    .where(
      and(
        eq(audits.kind, "owned"),
        eq(audits.status, "complete"),
        inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
      ),
    )
    .orderBy(audits.workspaceId, audits.siteUrl, desc(audits.createdAt));
}

/**
 * Re-audit every site that is *due* on its plan's monitoring cadence (weekly /
 * monthly — `dueForReaudit`), compute the delta vs its previous run, and return
 * the sites that should alert. Safe to fire daily: the cadence gate makes any
 * higher firing frequency a no-op. The caller sends the notifications.
 */
export async function reauditActiveSites(): Promise<ReauditAlert[]> {
  const sites = (await latestAuditPerSite()).filter((site) =>
    dueForReaudit(site.createdAt, visibilityCapsForPlan(site.planId).monitoringCadence),
  );
  const alerts: ReauditAlert[] = [];

  for (const site of sites) {
    try {
      const newAuditId = await createAudit(site.workspaceId, site.siteUrl);
      await executeAudit(newAuditId, site.siteUrl);
      // V8.5 autonomy loop: FULL_AUTO brands get auto-capable fixes applied now.
      await autoApplyFixes(
        site.workspaceId,
        site.siteUrl,
        newAuditId,
        visibilityCapsForPlan(site.planId).autoFixCap,
      );
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
