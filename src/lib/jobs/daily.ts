import { CREDIT_COSTS } from "@/lib/billing/credits";
import { dailyArticleCapForPlan } from "@/lib/billing/plans";
import type { BrandScope } from "@/lib/brand/repository";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import { sendOutOfCreditsEmail } from "@/lib/email/notify";
import { getDailyRun, upsertDailyRun, type DailyRunStatus } from "@/lib/jobs/daily-repository";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { runResearch } from "@/lib/research/run";
import { assertHasCredits, InsufficientCreditsError, spendCredits } from "@/lib/usage/credits";

/**
 * The daily content agent, decomposed into idempotent steps that the
 * `DailyBrandWorkflow` drives over HTTP (one Workflow instance per brand per
 * UTC day). Each function here is a single unit of work the Workflow checkpoints
 * and may retry, so all of them are safe to call repeatedly.
 *
 * Pipeline shape: plan → (optional) research → write N → settle. Credits remain
 * the real budget — generation stops the moment the workspace can't afford the
 * next article — and the plan's `dailyArticleCap` bounds the agent's output so a
 * single day never burns the month.
 */

export type DailyPlan = {
  /** Nothing to do today (no allowance, or the cap is already met). */
  skip: boolean;
  /** Terminal daily-run status recorded when skipping. */
  skipStatus: DailyRunStatus | null;
  cap: number;
  /** Articles the agent may still write today (cap − already-written). */
  budget: number;
  writtenToday: number;
  priorResearched: number;
  /** Queued topic ids to draw from, highest score first, already clipped to budget. */
  topicIds: string[];
  /** Queue can't cover the budget, so one research run is warranted. */
  needsResearch: boolean;
};

/**
 * Decide a brand's work for the day. Pure reads plus an idempotent upsert when
 * the cap is already met — safe to call repeatedly.
 */
export async function planDailyForBrand(
  scope: BrandScope,
  planId: string | null | undefined,
  runDate: string,
): Promise<DailyPlan> {
  const cap = dailyArticleCapForPlan(planId);

  // Plans with no daily allowance (free / unknown) are skipped entirely.
  if (cap <= 0) {
    return {
      skip: true,
      skipStatus: "idle",
      cap,
      budget: 0,
      writtenToday: 0,
      priorResearched: 0,
      topicIds: [],
      needsResearch: false,
    };
  }

  // The agent's articles-written-today live on the daily-run row, so the cap
  // bounds the AGENT's output (manual generation never eats into it) and a
  // re-fired day stays idempotent.
  const existing = await getDailyRun(scope.brandId, runDate);
  const writtenToday = existing?.articlesWritten ?? 0;
  const priorResearched = existing?.topicsResearched ?? 0;
  const budget = cap - writtenToday;

  // Already hit today's cap — record idle and stop.
  if (budget <= 0) {
    await upsertDailyRun(scope, runDate, {
      articlesWritten: writtenToday,
      topicsResearched: priorResearched,
      status: "idle",
      note: "Daily cap already met.",
    });
    return {
      skip: true,
      skipStatus: "idle",
      cap,
      budget: 0,
      writtenToday,
      priorResearched,
      topicIds: [],
      needsResearch: false,
    };
  }

  const pending = await listPendingTopicsForWriting(scope.brandId, budget);
  return {
    skip: false,
    skipStatus: null,
    cap,
    budget,
    writtenToday,
    priorResearched,
    topicIds: pending.map((topic) => topic.id),
    needsResearch: pending.length < budget,
  };
}

/**
 * Lean, quality-safe replenish: at most one research run, only when the queue
 * can't cover the day's budget. Idempotent on `idempotencyKey` (the Workflow
 * instance id) so a retried step reuses the same run and never double-charges.
 * Insufficient-credit errors are swallowed — research is optional; the day still
 * writes whatever is already queued. Returns the refreshed write targets.
 */
export async function researchForDaily(
  scope: BrandScope,
  budget: number,
  idempotencyKey: string,
): Promise<{ researchTopics: number; topicIds: string[] }> {
  let researchTopics = 0;
  try {
    await assertHasCredits(scope.workspaceId, CREDIT_COSTS.research_run);
    const research = await runResearch(scope, { idempotencyKey });
    researchTopics = research.topicsCreated;
    // Key the spend on the run id so the activity feed can attribute it, and so a
    // retry (same run id) is deduped by spendCredits.
    await spendCredits(scope.workspaceId, CREDIT_COSTS.research_run, {
      reason: "research_run",
      brandId: scope.brandId,
      refType: "research_run",
      refId: research.runId,
    });
  } catch (error) {
    if (!(error instanceof InsufficientCreditsError)) {
      throw error;
    }
  }

  const pending = await listPendingTopicsForWriting(scope.brandId, budget);
  return { researchTopics, topicIds: pending.map((topic) => topic.id) };
}

export type SettleInput = {
  cap: number;
  writtenToday: number;
  priorResearched: number;
  generated: number;
  researchTopics: number;
  /** Whether any topics were available to write (drives the no_topics status). */
  hadTargets: boolean;
  /** Whether the day stopped because the workspace ran out of credits. */
  outOfCredits: boolean;
  brandName?: string;
};

/**
 * Record the day's final state for a brand: settle the daily-run row (absolute
 * values, idempotent upsert), log a `daily_pipeline` job for the overview, and —
 * when paused for credits — nudge the owner (throttled). Returns the status.
 */
export async function settleDailyForBrand(
  scope: BrandScope,
  runDate: string,
  input: SettleInput,
): Promise<DailyRunStatus> {
  const finalWritten = input.writtenToday + input.generated;
  let status: DailyRunStatus;
  if (input.outOfCredits) {
    status = "paused_no_credits";
  } else if (!input.hadTargets && input.generated === 0) {
    status = "no_topics";
  } else {
    status = "active";
  }

  await upsertDailyRun(scope, runDate, {
    articlesWritten: finalWritten,
    topicsResearched: input.priorResearched + input.researchTopics,
    status,
  });

  // A single completed job per brand-day powers the overview stats; the research
  // and writing sub-jobs already record their own activity-feed entries.
  const job = await createAgentJob(scope, "daily_pipeline", "Daily content run");
  await finishAgentJob(
    job.id,
    "completed",
    `Wrote ${input.generated} article${input.generated === 1 ? "" : "s"}` +
      (input.researchTopics ? `; researched ${input.researchTopics} new topics.` : "."),
    { generatedCount: input.generated, researchTopics: input.researchTopics, status, dailyCap: input.cap },
  );

  // Out of credits with work still queued — nudge the owner (throttled).
  if (status === "paused_no_credits") {
    const remaining = await listPendingTopicsForWriting(scope.brandId, 50);
    await sendOutOfCreditsEmail({
      workspaceId: scope.workspaceId,
      brandName: input.brandName,
      pendingTopics: remaining.length,
    });
  }

  return status;
}
