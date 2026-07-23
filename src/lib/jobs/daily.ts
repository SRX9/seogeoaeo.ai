import { refreshAgentBrief } from "@/lib/agent/brief";
import {
  refreshResearchSourceStrategyWeights,
  selectProductionCandidate,
} from "@/lib/agent/learning";
import { getAgentControlState } from "@/lib/agent/memory";
import { isArticleGenerationBlockedByOwnerConstraint } from "@/lib/agent/policy";
import {
  AgentSafetyError,
  assertAgentOperationAllowed,
  getAgentSafetyDecision,
} from "@/lib/agent/safety";
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
import { runDueCheckpoints } from "@/lib/articles/performance";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import {
  sendOutOfCreditsEmail,
  sendToWorkspaceOwnerWhenEnabled,
} from "@/lib/email/notify";
import { dailyStandupEmail } from "@/lib/email/templates";
import { syncTrafficForBrand } from "@/lib/integrations/google-traffic";
import { maybeRediscoverCompetitors } from "@/lib/jobs/competitor-rediscovery";
import {
  getDailyRun,
  markDailySummaryEmailed,
  upsertDailyRun,
  type DailyRunStatus,
} from "@/lib/jobs/daily-repository";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { maybeRunWeeklySiteHealth } from "@/lib/jobs/site-health-weekly";
import { runResearch } from "@/lib/research/run";
import type { ResearchSourceType } from "@/lib/research/types";
import { assertHasCredits, InsufficientCreditsError, spendCredits } from "@/lib/usage/credits";

/**
 * The daily content agent, decomposed into idempotent steps that the
 * `DailyBrandWorkflow` drives over HTTP (one Workflow instance per brand per
 * UTC day). Each function here is a single unit of work the Workflow checkpoints
 * and may retry, so all of them are safe to call repeatedly.
 *
 * Pipeline shape: plan → (optional) research → write N → settle. Credits remain
 * the real budget: generation stops the moment the workspace can't afford the
 * next article: and the plan's `dailyArticleCap` bounds the agent's output so a
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
  const matches = (topic: T) => priorityMatchCount(topic, terms);
  return topics.toSorted(
    (left, right) =>
      Number(right.source === "owner_direction") - Number(left.source === "owner_direction") ||
      matches(right) - matches(left) ||
      (right.score ?? Number.NEGATIVE_INFINITY) -
        (left.score ?? Number.NEGATIVE_INFINITY),
  );
}

function priorityMatchCount(
  topic: { title: string; angle?: string | null; keywords?: string | null },
  terms: readonly string[],
) {
  const text = `${topic.title} ${topic.angle ?? ""} ${topic.keywords ?? ""}`.toLowerCase();
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

const RESEARCH_SOURCE_TYPES = new Set<ResearchSourceType>([
  "web_search",
  "rss",
  "sitemap",
  "trend_query",
  "keyword_api",
  "use_case",
  "competitor_gap",
  "gsc_query",
]);

function topicResearchSourceType(evidenceJson: string | null): ResearchSourceType | null {
  if (!evidenceJson) return null;
  try {
    const value = (JSON.parse(evidenceJson) as { sourceType?: unknown }).sourceType;
    return typeof value === "string" && RESEARCH_SOURCE_TYPES.has(value as ResearchSourceType)
      ? (value as ResearchSourceType)
      : null;
  } catch {
    return null;
  }
}

async function applyControlledTopicSelection<
  T extends {
    id: string;
    title: string;
    angle?: string | null;
    keywords?: string | null;
    score?: number | null;
    source?: string | null;
    evidenceJson: string | null;
  },
>(
  scope: BrandScope,
  ranked: T[],
  instructions: string[],
  seed: string,
) {
  const terms = priorityTerms(instructions);
  const research = ranked.flatMap((topic, index) => {
    if (topic.source !== "research") return [];
    const sourceType = topicResearchSourceType(topic.evidenceJson);
    return sourceType
      ? [{ topic, index, sourceType, priority: priorityMatchCount(topic, terms) }]
      : [];
  });
  if (research.length < 2) return ranked;

  // Explicit owner priorities stay above learning and exploration. Selection
  // only occurs within the highest matching research tier.
  const highestPriority = Math.max(...research.map((item) => item.priority));
  const eligible = research.filter((item) => item.priority === highestPriority).slice(0, 50);
  if (eligible.length < 2) return ranked;
  const selection = await selectProductionCandidate(
    scope,
    eligible.map(({ topic, sourceType }) => ({
      id: topic.id,
      baseScore: topic.score ?? 0,
      sourceType,
    })),
    { seed, maximumAlternatives: 3 },
  );
  if (!selection) return ranked;

  const selectedIndex = ranked.findIndex((topic) => topic.id === selection.candidate.id);
  const insertionIndex = Math.min(...eligible.map((item) => item.index));
  if (selectedIndex < 0 || selectedIndex === insertionIndex) return ranked;
  const reordered = [...ranked];
  const [selected] = reordered.splice(selectedIndex, 1);
  reordered.splice(insertionIndex, 0, selected);
  return reordered;
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
 * the cap is already met: safe to call repeatedly.
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
  const safety = getAgentSafetyDecision("drafting", { actor: "agent" });
  if (!safety.allowed) {
    return {
      skip: true,
      skipStatus: null,
      cap,
      budget: 0,
      writtenToday: 0,
      priorResearched: 0,
      topicIds: [],
      needsResearch: false,
    };
  }
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

  // Already hit today's cap: record idle and stop.
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

  const rankedPending = excludeOwnerBlockedTopics(
    rankTopicsForAgentPriorities(
      await listPendingTopicsForWriting(scope.brandId, Math.max(50, budget * 10)),
      controls.priorityInstructions,
    ),
    controls.ownerConstraints,
  );
  const pending = (
    await applyControlledTopicSelection(
      scope,
      rankedPending,
      controls.priorityInstructions,
      `daily:${scope.brandId}:${runDate}`,
    )
  ).slice(0, budget);
  try {
    const task = await beginDailyAgentTask(scope, runDate);
    if (task?.status === "cancelled") {
      await upsertDailyRun(scope, runDate, {
        articlesWritten: writtenToday,
        topicsResearched: priorResearched,
        status: "paused_by_owner",
        note: "The owner removed this daily task from the reviewed plan.",
      });
      return {
        skip: true,
        skipStatus: "paused_by_owner",
        cap,
        budget: 0,
        writtenToday,
        priorResearched,
        topicIds: [],
        needsResearch: false,
      };
    }
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
 * Insufficient-credit errors are swallowed: research is optional; the day still
 * writes whatever is already queued. Returns the refreshed write targets.
 */
export async function researchForDaily(
  scope: BrandScope,
  budget: number,
  idempotencyKey: string,
  billingWorkId?: string,
): Promise<{ researchTopics: number; topicIds: string[] }> {
  const controls = await getAgentControlState(scope.brandId);
  if (controls.paused) return { researchTopics: 0, topicIds: [] };
  let researchTopics = 0;
  try {
    assertAgentOperationAllowed("observation", { actor: "agent", controls });
    assertAgentOperationAllowed("billable", { actor: "agent", controls });
    await assertHasCredits(scope.workspaceId, CREDIT_COSTS.research_run);
    const research = await runResearch(scope, { idempotencyKey, actor: "agent" });
    researchTopics = research.topicsCreated;
    // Key the spend on the run id so the activity feed can attribute it, and so a
    // retry (same run id) is deduped by spendCredits.
    await spendCredits(scope.workspaceId, CREDIT_COSTS.research_run, {
      reason: "research_run",
      brandId: scope.brandId,
      refType: "research_run",
      refId: billingWorkId ?? research.runId,
      actor: "agent",
    });
  } catch (error) {
    if (!(error instanceof InsufficientCreditsError) && !(error instanceof AgentSafetyError)) {
      throw error;
    }
  }

  const rankedPending = excludeOwnerBlockedTopics(
    rankTopicsForAgentPriorities(
      await listPendingTopicsForWriting(scope.brandId, Math.max(50, budget * 10)),
      controls.priorityInstructions,
    ),
    controls.ownerConstraints,
  );
  const pending = (
    await applyControlledTopicSelection(
      scope,
      rankedPending,
      controls.priorityInstructions,
      `daily-research:${scope.brandId}:${idempotencyKey}`,
    )
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
  writeFailures?: Array<{
    topicId: string;
    outcome: "blocked" | "transient_failure" | "permanent_failure";
    errorClass: string;
  }>;
  brandName?: string;
  /** Plan id: gates the periodic competitor rediscovery. */
  planId?: string | null;
};

/**
 * Record the day's final state for a brand: settle the daily-run row (absolute
 * values, idempotent upsert), log a `daily_pipeline` job for the overview, and
 * nudge the owner when credits pause the work. Returns the status.
 */
export const DAILY_SETTLEMENT_OPERATIONS = [
  "settle_daily_run",
  "settle_agent_task",
  "record_summary_job",
  "sync_traffic",
  "performance_checkpoints",
  "update_source_weights",
  "rediscover_competitors",
  "site_health",
  "refresh_brief",
  "send_notifications",
] as const;

export type DailySettlementOperation = (typeof DAILY_SETTLEMENT_OPERATIONS)[number];

export async function deriveDailyRunStatus(
  scope: BrandScope,
  input: SettleInput,
): Promise<DailyRunStatus> {
  const controls = await getAgentControlState(scope.brandId);
  if (controls.paused) {
    return "paused_by_owner";
  }
  if (input.outOfCredits) return "paused_no_credits";
  if (!input.hadTargets && input.generated === 0) return "no_topics";
  if (input.hadTargets && input.generated === 0 && (input.writeFailures?.length ?? 0) > 0) {
    return "blocked";
  }
  if ((input.writeFailures?.length ?? 0) > 0) return "completed_degraded";
  return "completed";
}

/** One independently retryable/checkpointed daily settlement operation. */
export async function executeDailySettlementOperation(
  scope: BrandScope,
  runDate: string,
  input: SettleInput,
  operation: DailySettlementOperation,
): Promise<DailyRunStatus> {
  // A replay must be allowed to heal a previously blocked/degraded run. The
  // old persisted status describes the prior executor, not this settlement.
  const status = await deriveDailyRunStatus(scope, input);
  const finalWritten = input.writtenToday + input.generated;

  switch (operation) {
    case "settle_daily_run":
      await upsertDailyRun(scope, runDate, {
        articlesWritten: finalWritten,
        topicsResearched: input.priorResearched + input.researchTopics,
        status,
        note: input.writeFailures?.length
          ? `${input.writeFailures.length} write target(s) require recovery.`
          : null,
      });
      break;
    case "settle_agent_task":
      await completeDailyAgentTask(scope, runDate, {
        generated: input.generated,
        researched: input.researchTopics,
        status,
      });
      if (status !== "paused_by_owner") {
        await ensureNextDailyTask(scope, input.brandName, new Date(`${runDate}T23:59:59.999Z`));
      }
      break;
    case "record_summary_job": {
      const job = await createAgentJob(scope, "daily_pipeline", "Daily content run", {
        idempotencyKey: `daily:${runDate}:summary`,
      });
      await finishAgentJob(
        job.id,
        "completed",
        `Wrote ${input.generated} article${input.generated === 1 ? "" : "s"}` +
          (input.researchTopics ? `; researched ${input.researchTopics} new topics.` : "."),
        {
          generatedCount: input.generated,
          researchTopics: input.researchTopics,
          writeFailures: input.writeFailures ?? [],
          recoveryOwner: input.writeFailures?.length ? "operator" : null,
          status,
          dailyCap: input.cap,
        },
      );
      break;
    }
    case "sync_traffic":
      if (status !== "paused_by_owner") await syncTrafficForBrand(scope);
      break;
    case "performance_checkpoints": {
      if (status === "paused_by_owner") break;
      const checkpoints = await runDueCheckpoints(scope);
      const outcomes = checkpoints.byVerdict;
      if (checkpoints.checked > 0 && outcomes.winner + outcomes.stalling + outcomes.dead > 0) {
        await replanAgentWork(
          scope,
          `Performance evidence changed the queue: ${outcomes.winner} winning, ${outcomes.stalling} stalling, ${outcomes.dead} stopped.`,
          { source: "performance_checkpoints", ...checkpoints },
        );
      }
      break;
    }
    case "update_source_weights":
      if (status !== "paused_by_owner") await refreshResearchSourceStrategyWeights(scope);
      break;
    case "rediscover_competitors":
      if (status !== "paused_by_owner") await maybeRediscoverCompetitors(scope, input.planId);
      break;
    case "site_health":
      if (status !== "paused_by_owner") await maybeRunWeeklySiteHealth(scope);
      break;
    case "refresh_brief":
      if (status !== "paused_by_owner") {
        await refreshAgentBrief(scope, input.brandName ?? "your brand");
      }
      break;
    case "send_notifications":
      if (status === "paused_no_credits") {
        const remaining = await listPendingTopicsForWriting(scope.brandId, 50);
        await sendOutOfCreditsEmail({
          workspaceId: scope.workspaceId,
          brandName: input.brandName,
          pendingTopics: remaining.length,
        });
      }
      {
        const dailyRun = await getDailyRun(scope.brandId, runDate);
        if (!dailyRun?.summaryEmailedAt) {
          const origin =
            process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ||
            "https://seogeoaeo.ai";
          const sent = await sendToWorkspaceOwnerWhenEnabled(
            scope.workspaceId,
            "dailySummaryEmailsEnabled",
            dailyStandupEmail({
              brandName: input.brandName ?? "your brand",
              runDate,
              articlesWritten: finalWritten,
              topicsResearched: input.priorResearched + input.researchTopics,
              failures: input.writeFailures?.length ?? 0,
              status,
              dashboardUrl: `${origin}/dashboard`,
            }),
          );
          if (sent) await markDailySummaryEmailed(scope.brandId, runDate);
        }
      }
      break;
  }
  return status;
}

/** Compatibility executor used outside Cloudflare Workflows and by integration tests. */
export async function settleDailyForBrand(
  scope: BrandScope,
  runDate: string,
  input: SettleInput,
): Promise<DailyRunStatus> {
  let status: DailyRunStatus = await deriveDailyRunStatus(scope, input);
  // Inline/test compatibility path keeps the critical settlement contract.
  // Cloudflare Workflows invokes every optional enrichment as its own step.
  const coreOperations: DailySettlementOperation[] = [
    "settle_daily_run",
    "settle_agent_task",
    "record_summary_job",
    "send_notifications",
  ];
  for (const operation of coreOperations) {
    status = await executeDailySettlementOperation(scope, runDate, input, operation);
  }
  return status;
}
