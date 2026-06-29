import { eq } from "drizzle-orm";
import { isActiveSubscription } from "@/lib/billing/plans";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import type { BrandScope } from "@/lib/brand/repository";
import { listBrands } from "@/lib/brand/repository";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { logError } from "@/lib/logging/logger";
import { runResearch } from "@/lib/research/run";
import { assertHasCredits, InsufficientCreditsError, spendCredits } from "@/lib/usage/credits";
import { getDb } from "@/lib/db";
import { subscriptions, workspaces } from "@/lib/db/schema";

// Upper bound on articles generated per brand per run. The credit balance is the
// real limit (generation stops when it runs out); this just caps how many
// pending topics we pull in one pass.
const MAX_ARTICLES_PER_RUN = 50;

export async function listActiveWorkspaceIds() {
  const rows = await getDb()
    .select({
      workspaceId: workspaces.id,
      status: subscriptions.status,
      planId: subscriptions.planId,
    })
    .from(workspaces)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id));

  return rows.filter((row) => isActiveSubscription(row.status));
}

/**
 * Run research + writing for a single brand, drawing on the workspace credit
 * balance. Research and each article spend credits; the pipeline stops as soon
 * as the workspace can't afford the next step. The balance is a shared,
 * workspace-level pool, so once exhausted every brand in the workspace stops.
 */
export async function runWeeklyPipelineForBrand(scope: BrandScope) {
  const job = await createAgentJob(scope, "weekly_pipeline", "Weekly research and writing started");
  const origin = process.env.BETTER_AUTH_URL;

  try {
    let researchTopics = 0;
    // Only run research if the workspace can pay for it.
    try {
      await assertHasCredits(scope.workspaceId, CREDIT_COSTS.research_run);
      const research = await runResearch(scope);
      researchTopics = research.topicsCreated;
      // Key the spend on the run id (matching POST /api/research) so the
      // activity feed can attribute these credits to the research-run row.
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

    // Generate in score order until the topics or the credit balance run out.
    // generateArticleFromTopic asserts credits up front, so the first topic the
    // workspace can't afford throws InsufficientCreditsError and we stop.
    const topics = await listPendingTopicsForWriting(scope.brandId, MAX_ARTICLES_PER_RUN);
    const generated: string[] = [];
    const skipped: string[] = [];

    for (const topic of topics) {
      try {
        const { article } = await generateArticleFromTopic(scope, topic.id, { origin });
        generated.push(article.id);
      } catch (error) {
        skipped.push(topic.id);
        if (error instanceof InsufficientCreditsError) {
          break;
        }
      }
    }

    const message = `Research added ${researchTopics} topics; generated ${generated.length} articles.`;
    await finishAgentJob(job.id, "completed", message, {
      researchTopics,
      generatedArticleIds: generated,
      skippedTopicIds: skipped,
    });

    return { generated: generated.length, researchTopics };
  } catch (error) {
    // Store a user-friendly summary on the job; keep the raw error in the logs.
    const detail = error instanceof Error ? error.message : "Unknown error";
    await finishAgentJob(job.id, "failed", "Weekly pipeline failed — it will retry on the next run.");
    logError("weekly.pipeline_failed", { workspaceId: scope.workspaceId, error: detail });
    throw error;
  }
}

/** Run the weekly pipeline across every brand in a workspace, sharing credits. */
export async function runWeeklyPipelineForWorkspace(workspaceId: string) {
  const brands = await listBrands(workspaceId);
  let generated = 0;
  let researchTopics = 0;

  for (const brand of brands) {
    const scope: BrandScope = { workspaceId, brandId: brand.id };
    const result = await runWeeklyPipelineForBrand(scope);
    generated += result.generated;
    researchTopics += result.researchTopics;
  }

  return { generated, researchTopics, brands: brands.length };
}

export async function runWeeklyCron() {
  const activeWorkspaces = await listActiveWorkspaceIds();
  const results = [];

  for (const workspace of activeWorkspaces) {
    try {
      const result = await runWeeklyPipelineForWorkspace(workspace.workspaceId);
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
