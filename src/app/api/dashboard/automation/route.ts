import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { dailyArticleCapForPlan, isActiveSubscription } from "@/lib/billing/plans";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { listTopics } from "@/lib/articles/repository";
import { getDailyRun } from "@/lib/jobs/daily-repository";
import { getUsageTotals, getWeeklyPipelineStats } from "@/lib/jobs/repository";
import { getCreditBalance } from "@/lib/usage/credits";
import type { AgentState, AutomationStats } from "@/lib/api/queries";
import { DAILY_RUN_SCHEDULE_LABEL, getNextDailyRun, getUtcDayKey } from "@/lib/workspace/settings";

/**
 * Content-agent stats for the dashboard's "Your content agent" card. Split out
 * of the old aggregated /api/dashboard so the card loads (and fails) on its own.
 */
export async function GET() {
  return handleApi(async () => {
    const { workspace, subscription, brand } = await requireApiBrand();
    const active = isActiveSubscription(subscription?.status);

    const [credits, topics, weeklyStats, usageTotals, todayRun] = await Promise.all([
      getCreditBalance(workspace.id),
      listTopics(brand.id),
      getWeeklyPipelineStats(brand.id),
      getUsageTotals(brand.id),
      getDailyRun(brand.id, getUtcDayKey()),
    ]);

    // Only scored topics are writable by the agent, so "queued" mirrors exactly
    // what it will pick up (listPendingTopicsForWriting).
    const pendingTopics = topics.filter(
      (topic) => topic.status === "pending" && topic.score != null,
    ).length;
    // Articles the agent itself wrote today (from its daily-run row, not manual work).
    const writtenToday = todayRun?.articlesWritten ?? 0;
    const dailyCap = active ? dailyArticleCapForPlan(subscription?.planId) : 0;

    // High-level agent state for the card. Order matters: no plan outranks no
    // credits, and "out of credits" means it can't afford to write — independent
    // of whether anything is queued yet.
    let agentState: AgentState;
    if (!active) {
      agentState = "paused_no_subscription";
    } else if (credits.total < CREDIT_COSTS.article_generation) {
      agentState = "paused_no_credits";
    } else if (pendingTopics === 0) {
      agentState = "idle_caught_up";
    } else {
      agentState = "active";
    }

    return jsonOk({
      // The daily pipeline only runs for active subscriptions.
      enabled: active,
      autoPublish: brand.autonomyMode === "FULL_AUTO",
      schedule: DAILY_RUN_SCHEDULE_LABEL,
      nextRunAt: active ? getNextDailyRun().toISOString() : null,
      agentState,
      dailyCap,
      writtenToday,
      pendingTopics,
      workingSince: workspace.createdAt.toISOString(),
      totalRuns: weeklyStats.totalRuns,
      // Durable lifetime + this-week tallies from usage_counters.
      articlesWritten: usageTotals.articlesWritten,
      articlesPublished: usageTotals.articlesPublished,
      thisWeek: usageTotals.thisWeek,
      lastRun: weeklyStats.lastRun
        ? {
            status: weeklyStats.lastRun.status,
            createdAt: weeklyStats.lastRun.createdAt.toISOString(),
            articlesGenerated: weeklyStats.lastRun.articlesGenerated,
            topicsResearched: weeklyStats.lastRun.topicsResearched,
          }
        : null,
    } satisfies AutomationStats);
  });
}
