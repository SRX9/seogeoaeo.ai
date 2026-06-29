import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { dailyArticleCapForPlan, getPlan, isActiveSubscription } from "@/lib/billing/plans";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { listArticles, listTopics } from "@/lib/articles/repository";
import { getOnboardingSteps } from "@/lib/onboarding/status";
import { getLatestResearchRun } from "@/lib/research/repository";
import { getDailyRun } from "@/lib/jobs/daily-repository";
import { getUsageTotals, getWeeklyPipelineStats } from "@/lib/jobs/repository";
import { getCreditBalance } from "@/lib/usage/credits";
import type { AgentState } from "@/lib/api/queries";
import { DAILY_RUN_SCHEDULE_LABEL, getNextDailyRun, getUtcDayKey } from "@/lib/workspace/settings";

/** Aggregated dashboard payload — one request instead of many round trips. */
export async function GET() {
  return handleApi(async () => {
    const { workspace, subscription, brand } = await requireApiBrand();
    const active = isActiveSubscription(subscription?.status);
    const plan = active && subscription?.planId ? getPlan(subscription.planId) : null;

    const [latestRun, credits, onboardingSteps, articles, topics, weeklyStats, usageTotals, todayRun] =
      await Promise.all([
        getLatestResearchRun(brand.id),
        getCreditBalance(workspace.id),
        getOnboardingSteps(brand.id),
        listArticles(brand.id),
        listTopics(brand.id),
        getWeeklyPipelineStats(brand.id),
        getUsageTotals(brand.id),
        getDailyRun(brand.id, getUtcDayKey()),
      ]);

    const approvedArticles = articles.filter((article) => article.status === "approved").length;
    // Only scored topics are writable by the agent, so the "queued" count mirrors
    // exactly what it will pick up (listPendingTopicsForWriting).
    const pendingTopics = topics.filter(
      (topic) => topic.status === "pending" && topic.score != null,
    ).length;
    // Articles the agent itself wrote today (from its daily-run row, not manual work).
    const writtenToday = todayRun?.articlesWritten ?? 0;
    const recentArticles = articles.slice(0, 5).map((article) => ({
      id: article.id,
      title: article.title,
      status: article.status,
    }));

    // High-level agent state for the overview banner. Order matters: no plan
    // outranks no credits, and "out of credits" means it can't afford to write an
    // article — independent of whether anything is queued yet.
    const dailyCap = active ? dailyArticleCapForPlan(subscription?.planId) : 0;
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
      active,
      plan: plan ? { id: plan.id, name: plan.name } : null,
      autonomyMode: workspace.autonomyMode,
      credits,
      creditCosts: CREDIT_COSTS,
      monthlyCreditGrant: subscription?.monthlyCreditGrant ?? 0,
      canGenerate: credits.total >= CREDIT_COSTS.article_generation,
      totalArticles: articles.length,
      approvedArticles,
      pendingTopics,
      latestRun: latestRun
        ? { status: latestRun.status, summary: latestRun.summary, topicsCreated: latestRun.topicsCreated }
        : null,
      automation: {
        // The daily pipeline only runs for active subscriptions.
        enabled: active,
        autoPublish: workspace.autonomyMode === "FULL_AUTO",
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
      },
      onboardingSteps,
      recentArticles,
    });
  });
}
