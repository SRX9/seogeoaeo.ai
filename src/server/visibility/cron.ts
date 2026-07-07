import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { ACTIVE_SUBSCRIPTION_STATUSES, visibilityCapsForPlan } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { auditFindings, audits } from "@/lib/db/schema/visibility";
import { brandProfiles, brands } from "@/lib/db/schema/brand";
import { sendToWorkspaceOwner } from "@/lib/email/notify";
import { visibilityAlertEmail } from "@/lib/email/templates";
import { getServerEnv } from "@/lib/env";
import { dueForReaudit } from "@/lib/jobs/visibility-agent";
import { logInfo } from "@/lib/logging/logger";
import { SITE_URL } from "@/lib/site";
import { apexDomain } from "@/lib/visibility/answers";
import { applyFix } from "@/lib/visibility/apply-fix";
import { compareAudits, type DeltaReport } from "@/lib/visibility/compare";
import { createAudit, executeAudit } from "./run-audit";

/**
 * V7.3 — scheduled re-audits & alerts. A monthly (staggered) cron re-audits each
 * active site, stores a new run_version, computes the V6.3 delta, and alerts on a
 * score drop or a new Critical finding. Orchestration reuses V2.3 + V6.3.
 *
 * Execution shape: the cron route enumerates `listDueSites()` and fans each site
 * out into a durable `AuditRunWorkflow` instance (mode "monitor"), whose steps
 * call back into `/api/agent/audit-step` → `createAudit`/`executeAudit`/
 * `finishReaudit`. `reauditSite` is the inline fallback for runtimes without the
 * binding (plain `next dev`).
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

/** One site due for a scheduled re-audit. `id` is the baseline (latest complete) audit. */
export interface DueSite {
  id: string;
  workspaceId: string;
  siteUrl: string;
  planId: string | null;
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

  // The cap is *per month* (that's what the plan copy promises), not per
  // re-audit — on a weekly cadence an uncounted cap would quietly be 4× the
  // advertised number. Count what this workspace already auto-applied this
  // calendar month (resolvedAt is stamped by applyFix) and spend the remainder.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [used] = await db
    .select({ n: count() })
    .from(auditFindings)
    .where(
      and(
        eq(auditFindings.workspaceId, workspaceId),
        eq(auditFindings.fixCapability, "auto"),
        eq(auditFindings.isResolved, true),
        gte(auditFindings.resolvedAt, monthStart),
      ),
    );
  const remaining = autoFixCap - (used?.n ?? 0);
  if (remaining <= 0) return 0;

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
    .limit(remaining);

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
 * Every site *due* on its plan's monitoring cadence (weekly / monthly —
 * `dueForReaudit`). Safe to compute daily: the cadence gate makes any higher
 * firing frequency a no-op.
 */
export async function listDueSites(): Promise<DueSite[]> {
  return (await latestAuditPerSite())
    .filter((site) =>
      dueForReaudit(site.createdAt, visibilityCapsForPlan(site.planId).monitoringCadence),
    )
    .map(({ id, workspaceId, siteUrl, planId }) => ({ id, workspaceId, siteUrl, planId }));
}

/**
 * Post-audit phase of one scheduled re-audit: V8.5 auto-fixes, the V6.3 delta
 * vs the baseline, and the alert email (delivered immediately — a drop or new
 * critical shouldn't wait for the weekly digest). Runs as the `finish` step of
 * `AuditRunWorkflow` (mode "monitor"); only called after the audit completed.
 * Retry-tolerant: auto-fixes only touch findings still `isResolved = false`,
 * so a re-run skips what already applied; only the alert email can double-send
 * in the narrow window where a sent mail's response is lost — accepted rather
 * than building an idempotency ledger for it. Returns whether it alerted.
 */
export async function finishReaudit(args: {
  workspaceId: string;
  siteUrl: string;
  baselineAuditId: string;
  newAuditId: string;
  planId: string | null;
}): Promise<boolean> {
  await autoApplyFixes(
    args.workspaceId,
    args.siteUrl,
    args.newAuditId,
    visibilityCapsForPlan(args.planId).autoFixCap,
  );
  const delta = await compareAudits(args.baselineAuditId, args.newAuditId);
  const newCritical = await countNewCriticals(args.baselineAuditId, args.newAuditId);
  const decision = shouldAlert(delta, newCritical);
  if (decision.alert) {
    const origin = getServerEnv().BETTER_AUTH_URL ?? SITE_URL;
    await sendToWorkspaceOwner(
      args.workspaceId,
      visibilityAlertEmail({
        siteUrl: args.siteUrl,
        reasons: decision.reasons,
        dashboardUrl: `${origin}/dashboard`,
      }),
    );
    logInfo("cron.visibility.alert", {
      workspaceId: args.workspaceId,
      siteUrl: args.siteUrl,
      auditId: args.newAuditId,
      reasons: decision.reasons,
    });
  }
  return decision.alert;
}

/**
 * Audits stranded in `running` past any legitimate execution window (the
 * Workflow's execute step tops out well under an hour including retries) are
 * settled `failed` in bulk. The GET-poll self-heal only reaches audits a user
 * actively watches; this sweep — fired from the daily cron — also settles
 * monitor, setup, and benchmark rows, so nothing stays `running` forever.
 */
const STALE_AUDIT_SWEEP_MS = 2 * 60 * 60 * 1000;

export async function settleStaleAudits(): Promise<number> {
  const db = getDb();
  const settled = await db
    .update(audits)
    .set({
      status: "failed",
      error: "The audit was interrupted and timed out.",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(audits.status, "running"),
        lt(audits.createdAt, new Date(Date.now() - STALE_AUDIT_SWEEP_MS)),
      ),
    )
    .returning({ id: audits.id });
  return settled.length;
}

/**
 * One full re-audit end-to-end — the inline fallback when the AUDIT_WORKFLOW
 * binding is unavailable. On Cloudflare each due site runs as its own durable
 * Workflow instance instead, so one slow site can't starve the rest.
 */
export async function reauditSite(site: DueSite): Promise<boolean> {
  const newAuditId = await createAudit(site.workspaceId, site.siteUrl);
  const ok = await executeAudit(newAuditId, site.siteUrl);
  if (!ok) return false;
  return finishReaudit({
    workspaceId: site.workspaceId,
    siteUrl: site.siteUrl,
    baselineAuditId: site.id,
    newAuditId,
    planId: site.planId,
  });
}
