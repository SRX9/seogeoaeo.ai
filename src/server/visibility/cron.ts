import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { ACTIVE_SUBSCRIPTION_STATUSES, visibilityCapsForPlan } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { auditFindings, audits } from "@/lib/db/schema/visibility";
import { sendToWorkspaceOwner } from "@/lib/email/notify";
import { visibilityAlertEmail } from "@/lib/email/templates";
import { getServerEnv } from "@/lib/env";
import {
  createAgentJob,
  finishAgentJob,
  type VisibilityMonitorMeta,
} from "@/lib/jobs/repository";
import {
  dispatchDecision,
  dueForReaudit,
  type FindingKey,
} from "@/lib/jobs/visibility-agent";
import { logInfo } from "@/lib/logging/logger";
import { SITE_URL } from "@/lib/site";
import {
  assertVisibilityCredits,
  InsufficientCreditsError,
  spendForVisibilityJob,
} from "@/lib/usage/credits";
import { runAnswerCheck } from "@/lib/visibility/answers";
import { applyFix } from "@/lib/visibility/apply-fix";
import { compareAudits, type DeltaReport } from "@/lib/visibility/compare";
import { persistNewFindings } from "@/lib/visibility/findings-repository";
import { getAutonomyOverrides, resolveBrandForSite } from "./autonomy";
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

/** Drop threshold (points) below which a decline triggers an alert (AP4 §2: ≥5 → immediate). */
export const DROP_THRESHOLD = 5;

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

export interface DispatchSummary {
  applied: number;
  proposed: number;
  queued: number;
}

/**
 * AP4 — per-category autonomy dispatch. After a scheduled re-audit, every OPEN
 * finding in the workspace's fix queue — the new audit's, the standing backlog's
 * (dedup keeps re-detections on their original row), and the C2/C4 prepared
 * fixes that carry no audit id — gets one of three fates decided by the brand's
 * Autopilot/Copilot dial + its per-category overrides (`agent_autonomy`):
 * `apply` (Level 2, `auto`-capable, within the plan's *monthly* autoFixCap),
 * `propose` (Level 1 — stamped `proposedAt` for the approval inbox), or `queue`
 * (Level 0 — watch only). Best-effort per finding; retry-safe: applies only
 * touch `isResolved = false`, proposes only stamp where `proposedAt IS NULL`.
 */
async function dispatchFixes(
  workspaceId: string,
  autoFixCap: number,
  brand: { brandId: string; autonomyMode: "FULL_AUTO" | "REVIEW" } | null,
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { applied: 0, proposed: 0, queued: 0 };
  const db = getDb();

  // No resolvable brand → nothing to decide with; leave everything queued.
  if (!brand) return summary;
  const overrides = await getAutonomyOverrides(brand.brandId);

  // The cap is *per month* (that's what the plan copy promises), not per
  // re-audit — on a weekly cadence an uncounted cap would quietly be 4× the
  // advertised number. Count only what the AGENT auto-applied this calendar
  // month (`resolution = auto_applied`, stamped by applyFix(…, "agent")) —
  // user dismissals and one-click applies must never eat the agent's budget.
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [used] = await db
    .select({ n: count() })
    .from(auditFindings)
    .where(
      and(
        eq(auditFindings.workspaceId, workspaceId),
        eq(auditFindings.resolution, "auto_applied"),
        gte(auditFindings.resolvedAt, monthStart),
      ),
    );
  let remaining = Math.max(0, autoFixCap - (used?.n ?? 0));

  // Scope to this brand so multi-brand workspaces don't auto-apply each other's findings.
  const findings = await db
    .select({
      id: auditFindings.id,
      category: auditFindings.category,
      fixCapability: auditFindings.fixCapability,
      proposedAt: auditFindings.proposedAt,
    })
    .from(auditFindings)
    .where(
      and(
        eq(auditFindings.workspaceId, workspaceId),
        eq(auditFindings.brandId, brand.brandId),
        eq(auditFindings.isResolved, false),
      ),
    );

  const toPropose: string[] = [];
  for (const finding of findings) {
    let action = dispatchDecision(finding, brand.autonomyMode, overrides);
    // Cap exhausted: she still prepares the fix, just can't apply it herself.
    if (action === "apply" && remaining <= 0) action = "propose";
    if (action === "apply") {
      try {
        await applyFix(finding.id, workspaceId, "agent");
        summary.applied += 1;
        remaining -= 1;
      } catch (error) {
        console.error(`[visibility] auto-fix failed for finding ${finding.id}`, error);
      }
    } else if (action === "propose") {
      // Count only NEWLY prepared fixes — the whole backlog is re-scanned each
      // cycle, and "prepared N" must mean this cycle's work, not the queue size.
      if (!finding.proposedAt) {
        summary.proposed += 1;
        toPropose.push(finding.id);
      }
    } else {
      summary.queued += 1;
    }
  }

  if (toPropose.length > 0) {
    await db
      .update(auditFindings)
      .set({ proposedAt: now })
      .where(and(inArray(auditFindings.id, toPropose), isNull(auditFindings.proposedAt)));
  }
  return summary;
}

const APPLIED_RESOLUTIONS = ["auto_applied", "user_applied", "completed"] as const;

/**
 * AP4 fix verification. `persistNewFindings` is the ground truth for
 * re-detection: an APPLIED finding the new audit re-detects gets its row
 * reopened with a `regressedAt` stamp (workspace-wide dedupe means the
 * re-detection lands on the original row, whatever audit it came from), so:
 * - *verified*  = applied before this audit ran (`resolvedAt` predates it,
 *   dismissals excluded by `resolution`) and still resolved after the audit
 *   persisted — the fix held. Stamped `verifiedAt`, reported once.
 * - *regressed* = rows reopened by a re-detection since the baseline audit.
 */
async function verifyAppliedFixes(
  workspaceId: string,
  baselineAuditId: string,
  currentAuditId: string,
): Promise<{ verified: FindingKey[]; regressed: FindingKey[] }> {
  const db = getDb();
  const stamps = await db
    .select({ id: audits.id, createdAt: audits.createdAt })
    .from(audits)
    .where(inArray(audits.id, [baselineAuditId, currentAuditId]));
  const baselineAt = stamps.find((a) => a.id === baselineAuditId)?.createdAt ?? new Date(0);
  const currentAt = stamps.find((a) => a.id === currentAuditId)?.createdAt ?? new Date();

  const [held, reopened] = await Promise.all([
    db
      .select({
        id: auditFindings.id,
        category: auditFindings.category,
        title: auditFindings.title,
      })
      .from(auditFindings)
      .where(
        and(
          eq(auditFindings.workspaceId, workspaceId),
          eq(auditFindings.isResolved, true),
          inArray(auditFindings.resolution, [...APPLIED_RESOLUTIONS]),
          isNull(auditFindings.verifiedAt),
          lt(auditFindings.resolvedAt, currentAt),
        ),
      ),
    db
      .select({ category: auditFindings.category, title: auditFindings.title })
      .from(auditFindings)
      .where(
        and(
          eq(auditFindings.workspaceId, workspaceId),
          gte(auditFindings.regressedAt, baselineAt),
        ),
      ),
  ]);

  if (held.length > 0) {
    await db
      .update(auditFindings)
      .set({ verifiedAt: new Date() })
      .where(
        and(
          inArray(auditFindings.id, held.map((f) => f.id)),
          isNull(auditFindings.verifiedAt),
        ),
      );
  }
  return {
    verified: held.map(({ category, title }) => ({ category, title })),
    regressed: reopened.map(({ category, title }) => ({ category, title })),
  };
}

/**
 * Competitor context without a re-benchmark bill: the latest completed
 * benchmark audit's score vs ours, and how the gap moved this cycle.
 */
async function competitorGap(
  workspaceId: string,
  delta: DeltaReport,
): Promise<{ competitorScore: number; gap: number | null; gapDelta: number | null } | null> {
  const [benchmark] = await getDb()
    .select({ score: audits.overallScore, siteUrl: audits.siteUrl })
    .from(audits)
    .where(
      and(
        eq(audits.workspaceId, workspaceId),
        eq(audits.kind, "benchmark"),
        eq(audits.status, "complete"),
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(1);
  if (!benchmark || benchmark.score == null) return null;
  const gap = delta.overall.current != null ? delta.overall.current - benchmark.score : null;
  const gapBaseline =
    delta.overall.baseline != null ? delta.overall.baseline - benchmark.score : null;
  return {
    competitorScore: benchmark.score,
    gap,
    gapDelta: gap != null && gapBaseline != null ? gap - gapBaseline : null,
  };
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
  // Prefer the latest complete audit that finished its monitor cycle. A scrape
  // that completed without `finish` must not advance the cadence window.
  // Manual/setup audits never set monitorFinishedAt — treat them as valid baselines
  // so a user-triggered audit still resets the re-audit clock.
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
        // Exclude unfinished monitor runs still inside the finish-retry window:
        // a complete scrape without `finish` must not advance the cadence.
        or(
          isNotNull(audits.monitorFinishedAt),
          lt(audits.createdAt, new Date(Date.now() - 2 * 60 * 60 * 1000)),
        ),
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
 * Post-audit phase of one scheduled re-audit — AP4's standing-loop core:
 * verify last cycle's applied fixes, dispatch this cycle's findings by
 * per-category autonomy, compute the V6.3 delta, alert immediately on a
 * material drop or new critical, and write one attribution row (`agent_jobs`
 * kind `visibility_monitor`) recording what the agent did and what moved.
 * Runs as the `finish` step of `AuditRunWorkflow` (mode "monitor"); only
 * called after the audit completed. Retry-tolerant: applies only touch
 * `isResolved = false`, proposes/verifications only stamp null timestamps;
 * only the alert email can double-send in the narrow window where a sent
 * mail's response is lost — accepted rather than building an idempotency
 * ledger for it. Returns whether it alerted.
 */
export async function finishReaudit(args: {
  workspaceId: string;
  siteUrl: string;
  baselineAuditId: string;
  newAuditId: string;
  planId: string | null;
}): Promise<boolean> {
  const brand = await resolveBrandForSite(args.workspaceId, args.siteUrl);

  // Verify before dispatch so a fix applied *this* cycle isn't graded by an
  // audit that ran before it existed.
  const outcomes = await verifyAppliedFixes(
    args.workspaceId,
    args.baselineAuditId,
    args.newAuditId,
  );
  const dispatch = await dispatchFixes(
    args.workspaceId,
    visibilityCapsForPlan(args.planId).autoFixCap,
    brand,
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

  // Stamp finish before attribution so a lost response on the job write still
  // advances cadence correctly — finish work itself is retry-safe.
  await getDb()
    .update(audits)
    .set({ monitorFinishedAt: new Date() })
    .where(and(eq(audits.id, args.newAuditId), isNull(audits.monitorFinishedAt)));

  // Attribution — best-effort, after all idempotent writes (daily.ts pattern):
  // a failed log line never fails (or re-runs) the re-audit itself.
  if (brand) {
    try {
      const competitor = await competitorGap(args.workspaceId, delta);
      const job = await createAgentJob(
        { workspaceId: args.workspaceId, brandId: brand.brandId },
        "visibility_monitor",
        `Scheduled re-audit of ${args.siteUrl}`,
      );
      const gain = delta.overall.delta;
      const meta: VisibilityMonitorMeta = {
        auditId: args.newAuditId,
        baselineAuditId: args.baselineAuditId,
        applied: dispatch.applied,
        proposed: dispatch.proposed,
        queued: dispatch.queued,
        verified: outcomes.verified,
        regressed: outcomes.regressed,
        overallDelta: delta.overall,
        categoryDeltas: delta.subScores,
        competitor,
        alerted: decision.alert,
      };
      await finishAgentJob(
        job.id,
        "completed",
        `Re-audit complete: applied ${dispatch.applied}, prepared ${dispatch.proposed}, verified ${outcomes.verified.length} fix(es)${outcomes.regressed.length > 0 ? `, ${outcomes.regressed.length} regressed` : ""}; score ${gain >= 0 ? "+" : ""}${gain}.`,
        meta,
      );
    } catch (error) {
      console.error("[visibility] monitor attribution failed", error);
    }
  }

  return decision.alert;
}

/**
 * AP4 — the cadence answer check, run as the (non-fatal) `answers` step of a
 * monitor `AuditRunWorkflow` after `finish`. Credit-gated with the audit id as
 * the ledger refId, so an at-least-once step retry never double-charges; skips
 * quietly (and says why) when the brand has no prompts or the tank is empty —
 * degrade gracefully, never fail the cycle.
 */
export async function runScheduledAnswerCheck(args: {
  workspaceId: string;
  siteUrl: string;
  newAuditId: string;
}): Promise<{ ran: boolean; reason?: string }> {
  const brand = await resolveBrandForSite(args.workspaceId, args.siteUrl);
  if (!brand) return { ran: false, reason: "no matching brand" };

  try {
    await assertVisibilityCredits(args.workspaceId, "answer_run");
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      logInfo("cron.visibility.answers.skipped", {
        workspaceId: args.workspaceId,
        reason: "insufficient credits",
      });
      return { ran: false, reason: "insufficient credits" };
    }
    throw error;
  }

  // refId keys both the credit spend AND the answer-run rows: a workflow step
  // retry replaces its own rows instead of double-counting the week's share.
  const result = await runAnswerCheck(brand.brandId, { refId: args.newAuditId });
  // No cells = no active prompts (or every engine failed) — nothing to bill.
  if (result.cells.length === 0) return { ran: false, reason: "no prompts or engine results" };

  await spendForVisibilityJob(args.workspaceId, "answer_run", args.newAuditId, brand.brandId);
  // Answer-gap findings join the shared fix queue (dedup lives in the repository).
  await persistNewFindings(args.workspaceId, result.findings, { brandId: brand.brandId });
  logInfo("cron.visibility.answers", {
    workspaceId: args.workspaceId,
    brandId: brand.brandId,
    cells: result.cells.length,
  });
  return { ran: true };
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
  const brand = await resolveBrandForSite(site.workspaceId, site.siteUrl);
  const newAuditId = await createAudit(
    site.workspaceId,
    site.siteUrl,
    "owned",
    brand?.brandId ?? null,
  );
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
