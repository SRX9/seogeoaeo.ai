import { CREDIT_COSTS } from "@/lib/billing/credits";
import { dailyArticleCapForPlan } from "@/lib/billing/plans";
import type { BrandScope } from "@/lib/brand/repository";
import { listBrands } from "@/lib/brand/repository";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import { sendOutOfCreditsEmail } from "@/lib/email/notify";
import { getDailyRun, upsertDailyRun, type DailyRunStatus } from "@/lib/jobs/daily-repository";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { listActiveWorkspaceIds } from "@/lib/jobs/weekly";
import { logError } from "@/lib/logging/logger";
import { runResearch } from "@/lib/research/run";
import { assertHasCredits, InsufficientCreditsError, spendCredits } from "@/lib/usage/credits";
import { getUtcDayKey } from "@/lib/workspace/settings";

type Brand = { id: string; name: string };

export type DailyBrandResult = {
  generated: number;
  researchTopics: number;
  status: DailyRunStatus;
};

/**
 * One day's work for a single brand. The agent writes up to the plan's daily cap,
 * topping up its topic backlog with ONE research run first if the queue is below
 * the day's budget — and it never lowers the score bar to manufacture topics, so a
 * thin queue simply means fewer (or zero) articles today. When real work is queued
 * but credits are exhausted, it records `paused_no_credits` and emails the owner.
 *
 * Idempotent: the day's budget is derived from how many articles already exist for
 * the brand today, so a re-fired cron converges instead of double-writing.
 */
export async function runDailyPipelineForBrand(
  workspaceId: string,
  brand: Brand,
  planId: string | null | undefined,
): Promise<DailyBrandResult> {
  const scope: BrandScope = { workspaceId, brandId: brand.id };
  const cap = dailyArticleCapForPlan(planId);
  const runDate = getUtcDayKey();

  // Plans with no daily allowance (free / unknown) are skipped entirely.
  if (cap <= 0) {
    return { generated: 0, researchTopics: 0, status: "idle" };
  }

  // The agent's own articles-written-today live on the daily-run row, so the cap
  // bounds the AGENT's output (manual generation never eats into it) while a
  // re-fired cron stays idempotent.
  const existing = await getDailyRun(brand.id, runDate);
  const writtenToday = existing?.articlesWritten ?? 0;
  const priorResearched = existing?.topicsResearched ?? 0;
  const budget = cap - writtenToday;

  // Already hit today's cap — nothing more to do.
  if (budget <= 0) {
    await upsertDailyRun(scope, runDate, {
      articlesWritten: writtenToday,
      topicsResearched: priorResearched,
      status: "idle",
      note: "Daily cap already met.",
    });
    return { generated: 0, researchTopics: 0, status: "idle" };
  }

  const job = await createAgentJob(scope, "daily_pipeline", "Daily content run started");
  const origin = process.env.BETTER_AUTH_URL;
  let researchTopics = 0;
  let generated = 0;
  let outOfCredits = false;

  try {
    // 1. Lean, quality-safe replenish: at most one research run, and only when the
    //    queue can't cover today's budget. runResearch keeps only topics scoring
    //    >= MIN_SCORE and de-duped against existing titles, so nothing is forced.
    let pending = await listPendingTopicsForWriting(brand.id, budget);
    if (pending.length < budget) {
      try {
        await assertHasCredits(workspaceId, CREDIT_COSTS.research_run);
        const research = await runResearch(scope);
        researchTopics = research.topicsCreated;
        await spendCredits(workspaceId, CREDIT_COSTS.research_run, {
          reason: "research_run",
          brandId: brand.id,
          refType: "research_run",
          refId: research.runId,
        });
        pending = await listPendingTopicsForWriting(brand.id, budget);
      } catch (error) {
        // Can't afford research — fine, write whatever is already queued.
        if (!(error instanceof InsufficientCreditsError)) {
          throw error;
        }
      }
    }

    const pendingExisted = pending.length > 0;

    // 2. Write up to the day's budget, highest score first. generateArticleFromTopic
    //    asserts credits up front, so the first unaffordable topic stops the loop.
    for (const topic of pending.slice(0, budget)) {
      try {
        await generateArticleFromTopic(scope, topic.id, { origin });
        generated += 1;
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          outOfCredits = true;
          break;
        }
        // A single article failing (e.g. an LLM hiccup) shouldn't sink the day.
      }
    }

    // 3. Settle the day's state.
    const finalWritten = writtenToday + generated;
    let status: DailyRunStatus;
    if (outOfCredits) {
      status = "paused_no_credits";
    } else if (!pendingExisted && generated === 0) {
      status = "no_topics";
    } else {
      status = "active";
    }

    await upsertDailyRun(scope, runDate, {
      articlesWritten: finalWritten,
      topicsResearched: priorResearched + researchTopics,
      status,
    });

    await finishAgentJob(
      job.id,
      "completed",
      `Wrote ${generated} article${generated === 1 ? "" : "s"}` +
        (researchTopics ? `; researched ${researchTopics} new topics.` : "."),
      { generatedCount: generated, researchTopics, status, dailyCap: cap },
    );

    // 4. Out of credits with work still queued — nudge the owner (throttled).
    if (status === "paused_no_credits") {
      const remaining = await listPendingTopicsForWriting(brand.id, 50);
      await sendOutOfCreditsEmail({
        workspaceId,
        brandName: brand.name,
        pendingTopics: remaining.length,
      });
    }

    return { generated, researchTopics, status };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    await finishAgentJob(job.id, "failed", "Daily run failed — it will retry tomorrow.");
    await upsertDailyRun(scope, runDate, {
      articlesWritten: writtenToday + generated,
      topicsResearched: priorResearched + researchTopics,
      status: "active",
      note: "Run errored; will retry next day.",
    });
    logError("daily.pipeline_failed", { workspaceId, brandId: brand.id, error: detail });
    return { generated, researchTopics, status: "active" };
  }
}

/** Run the daily pipeline for every brand in a workspace (shared credit pool). */
export async function runDailyForWorkspace(workspaceId: string, planId: string | null | undefined) {
  const brands = await listBrands(workspaceId);
  let generated = 0;
  let researchTopics = 0;

  for (const brand of brands) {
    try {
      const result = await runDailyPipelineForBrand(workspaceId, brand, planId);
      generated += result.generated;
      researchTopics += result.researchTopics;
    } catch (error) {
      // One brand failing (e.g. a transient DB error during setup) must not skip
      // its siblings — log and carry on.
      logError("daily.brand_failed", {
        workspaceId,
        brandId: brand.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { generated, researchTopics, brands: brands.length };
}

export async function runDailyCron() {
  const activeWorkspaces = await listActiveWorkspaceIds();
  const results = [];

  for (const workspace of activeWorkspaces) {
    try {
      const result = await runDailyForWorkspace(workspace.workspaceId, workspace.planId);
      results.push({ workspaceId: workspace.workspaceId, ...result, status: "completed" });
    } catch (error) {
      results.push({
        workspaceId: workspace.workspaceId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
