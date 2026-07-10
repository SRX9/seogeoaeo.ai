import { refreshAgentBrief } from "@/lib/agent/brief";
import { getAgentControlState } from "@/lib/agent/memory";
import { isArticleGenerationBlockedByOwnerConstraint } from "@/lib/agent/policy";
import {
  beginDailyAgentTask,
  completeDailyAgentTask,
  ensureNextDailyTask,
  replanAgentWork,
  setFutureAgentTasksPaused,
} from "@/lib/agent/planner";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { dailyArticleCapForPlan } from "@/lib/billing/plans";
import type { BrandScope } from "@/lib/brand/repository";
import { maybeUpdateSourceWeights, runDueCheckpoints } from "@/lib/articles/performance";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import { sendOutOfCreditsEmail } from "@/lib/email/notify";
import { syncTrafficForBrand } from "@/lib/integrations/google-traffic";
import { maybeRediscoverCompetitors } from "@/lib/jobs/competitor-rediscovery";
import { getDailyRun, upsertDailyRun, type DailyRunStatus } from "@/lib/jobs/daily-repository";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { maybeRunWeeklySiteHealth } from "@/lib/jobs/site-health-weekly";
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

const PRIORITY_STOP_WORDS = new Set([
  "focus",
  "prioritize",
  "priority",
  "emphasize",
  "concentrate",
  "this",
  "that",
  "with",
  "from",
  "month",
  "week",
  "buyers",
]);

function priorityTerms(instructions: string[]): string[] {
  return [...new Set(
    instructions.flatMap((instruction) =>
      instruction
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2 && !PRIORITY_STOP_WORDS.has(word)),
    ),
  )];
}

/** Stable ranking: owner-priority matches first, existing evidence score within each group. */
export function rankTopicsForAgentPriorities<
  T extends {
    title: string;
    angle?: string | null;
    keywords?: string | null;
    score?: number | null;
    source?: string | null;
  },
>(topics: T[], instructions: string[]): T[] {
  const terms = priorityTerms(instructions);
  const matches = (topic: T) => {
    const text = `${topic.title} ${topic.angle ?? ""} ${topic.keywords ?? ""}`.toLowerCase();
    return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  };
  return topics.toSorted(
    (left, right) =>
      Number(right.source === "owner_direction") - Number(left.source === "owner_direction") ||
      matches(right) - matches(left) ||
      (right.score ?? Number.NEGATIVE_INFINITY) -
        (left.score ?? Number.NEGATIVE_INFINITY),
  );
}

function excludeOwnerBlockedTopics<
  T extends { title: string },
>(topics: T[], constraints: string[]): T[] {
  return topics.filter(
    (topic) =>
      !constraints.some((constraint) =>
        isArticleGenerationBlockedByOwnerConstraint(constraint, topic.title),
      ),
  );
}

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


  const controls = await getAgentControlState(scope.brandId);
  if (controls.paused) {
    const existing = await getDailyRun(scope.brandId, runDate);
    await upsertDailyRun(scope, runDate, {
      articlesWritten: existing?.articlesWritten ?? 0,
      topicsResearched: existing?.topicsResearched ?? 0,
      status: "paused_by_owner",
      note: controls.pauseInstruction ?? "Paused by owner instruction.",
    });
    return {
      skip: true,
      skipStatus: "paused_by_owner",
      cap,
      budget: 0,
      writtenToday: existing?.articlesWritten ?? 0,
      priorResearched: existing?.topicsResearched ?? 0,
      topicIds: [],
      needsResearch: false,
    };
  }
  await setFutureAgentTasksPaused(scope, false);

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

  const pending = excludeOwnerBlockedTopics(
    rankTopicsForAgentPriorities(
      await listPendingTopicsForWriting(scope.brandId, Math.max(50, budget * 10)),
      controls.priorityInstructions,
    ),
    controls.ownerConstraints,
  ).slice(0, budget);
  try {
    await beginDailyAgentTask(scope, runDate);
  } catch (error) {
    console.error("[daily] agent task start failed", error);
  }
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
  const controls = await getAgentControlState(scope.brandId);
  if (controls.paused) return { researchTopics: 0, topicIds: [] };
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

  const pending = excludeOwnerBlockedTopics(
    rankTopicsForAgentPriorities(
      await listPendingTopicsForWriting(scope.brandId, Math.max(50, budget * 10)),
      controls.priorityInstructions,
    ),
    controls.ownerConstraints,
  ).slice(0, budget);
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
  /** Plan id — gates the periodic competitor rediscovery. */
  planId?: string | null;
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
  const controls = await getAgentControlState(scope.brandId);
  let status: DailyRunStatus;
  if (controls.paused) {
    status = "paused_by_owner";
  } else if (input.outOfCredits) {
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

  try {
    await completeDailyAgentTask(scope, runDate, {
      generated: input.generated,
      researched: input.researchTopics,
      status,
    });
    if (status !== "paused_by_owner") {
      await ensureNextDailyTask(scope, input.brandName, new Date(`${runDate}T23:59:59.999Z`));
    }
  } catch (error) {
    console.error("[daily] agent task settlement failed", error);
  }

  // A single completed job per brand-day powers the overview stats; the research
  // and writing sub-jobs already record their own activity-feed entries.
  // Best-effort, after the upsert: agent jobs are NOT idempotent, so if a failed
  // job write bubbled up the Workflow would retry settle and insert a duplicate
  // `daily_pipeline` row, double-counting the day.
  try {
    const job = await createAgentJob(scope, "daily_pipeline", "Daily content run");
    await finishAgentJob(
      job.id,
      "completed",
      `Wrote ${input.generated} article${input.generated === 1 ? "" : "s"}` +
        (input.researchTopics ? `; researched ${input.researchTopics} new topics.` : "."),
      { generatedCount: input.generated, researchTopics: input.researchTopics, status, dailyCap: input.cap },
    );
  } catch (error) {
    console.error("[daily] overview job log failed", error);
  }

  // A pause issued while the Workflow was already in flight is honored at the
  // settle boundary: persist what finished, then stop every follow-on activity.
  if (status === "paused_by_owner") return status;

  // Pull traffic proof for any connected source (GSC/GA4) once per brand-day.
  // Best-effort and unmetered — a missing grant or API hiccup never affects the
  // content run's status.
  try {
    await syncTrafficForBrand(scope);
  } catch (error) {
    console.error("[daily] traffic sync failed", error);
  }

  // C4: read any published articles whose day-7/28/90 checkpoint came due
  // (cheap reads of the C2 query report) and act on the verdicts. Best-effort.
  try {
    const checkpoints = await runDueCheckpoints(scope);
    const outcomes = checkpoints.byVerdict;
    if (checkpoints.checked > 0 && outcomes.winner + outcomes.stalling + outcomes.dead > 0) {
      await replanAgentWork(
        scope,
        `Performance evidence changed the queue: ${outcomes.winner} winning, ${outcomes.stalling} stalling, ${outcomes.dead} stopped.`,
        { source: "performance_checkpoints", ...checkpoints },
      );
    }
  } catch (error) {
    console.error("[daily] performance checkpoints failed", error);
  }

  // C4: monthly, re-learn per-source topic weights from checkpoint outcomes.
  try {
    await maybeUpdateSourceWeights(scope);
  } catch (error) {
    console.error("[daily] source weight learning failed", error);
  }

  // Every 15 days: re-run evidence-based competitor discovery and auto-fill any
  // open plan slots. Best-effort — a failed scan never affects the day's status.
  try {
    await maybeRediscoverCompetitors(scope, input.planId);
  } catch (error) {
    console.error("[daily] competitor rediscovery failed", error);
  }

  // Weekly: re-verify every Site Health check (speed, meta, social previews,
  // crawler access) and queue fixes for anything that slipped. Plan-included
  // and best-effort — a failed check never affects the day's status.
  try {
    await maybeRunWeeklySiteHealth(scope);
  } catch (error) {
    console.error("[daily] site health check failed", error);
  }

  // AP3: regenerate Claudia's Overview brief from today's run data. Best-effort
  // and unmetered — the dashboard falls back to a derived brief on a miss.
  try {
    await refreshAgentBrief(scope, input.brandName ?? "your brand");
  } catch (error) {
    console.error("[daily] agent brief refresh failed", error);
  }

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
