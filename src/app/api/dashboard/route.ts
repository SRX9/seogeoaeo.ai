import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getPlan, isActiveSubscription } from "@/lib/billing/plans";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { listArticles, listTopics } from "@/lib/articles/repository";
import { getOnboardingSteps } from "@/lib/onboarding/status";
import { getLatestResearchRun } from "@/lib/research/repository";
import { getCreditBalance } from "@/lib/usage/credits";

/** Aggregated dashboard payload — one request instead of many round trips. */
export async function GET() {
  return handleApi(async () => {
    const { workspace, subscription, brand } = await requireApiBrand();
    const active = isActiveSubscription(subscription?.status);
    const plan = active && subscription?.planId ? getPlan(subscription.planId) : null;

    const [latestRun, credits, onboardingSteps, articles, topics] = await Promise.all([
      getLatestResearchRun(brand.id),
      getCreditBalance(workspace.id),
      getOnboardingSteps(brand.id),
      listArticles(brand.id),
      listTopics(brand.id),
    ]);

    const approvedArticles = articles.filter((article) => article.status === "approved").length;
    const pendingTopics = topics.filter((topic) => topic.status === "pending").length;
    const recentArticles = articles.slice(0, 5).map((article) => ({
      id: article.id,
      title: article.title,
      status: article.status,
    }));

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
      onboardingSteps,
      recentArticles,
    });
  });
}
