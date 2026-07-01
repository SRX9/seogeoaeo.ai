import { getBrandProfile, listCompetitors, type BrandScope } from "@/lib/brand/repository";
import {
  createResearchTopics,
  deleteResearchTopicsForRun,
  listTopicTitles,
} from "@/lib/articles/repository";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import { buildResearchContext, researchProviders } from "@/lib/research/providers";
import {
  completeResearchRun,
  createResearchRun,
  getResearchRunByKey,
} from "@/lib/research/repository";
import { scoreFindings } from "@/lib/research/score";
import type { ResearchFinding } from "@/lib/research/types";
import { uniqueByTitle } from "@/lib/research/utils";
import { logError, logInfo } from "@/lib/logging/logger";

export type RunResearchOptions = {
  /**
   * Stable key (the Workflow instance id) that makes the run idempotent. A
   * retried step with the same key returns the already-completed run instead of
   * re-discovering and inserting a fresh set of duplicate topics.
   */
  idempotencyKey?: string;
};

export async function runResearch(scope: BrandScope, options: RunResearchOptions = {}) {
  const { workspaceId, brandId } = scope;
  const idempotencyKey = options.idempotencyKey ?? null;

  // Idempotent reuse. A finished run for this key short-circuits. A stale partial
  // attempt (failed before completing) has its pending topics cleared and its row
  // reused — the unique index forbids inserting a second run with the same key.
  let run: Awaited<ReturnType<typeof createResearchRun>> | null = null;
  if (idempotencyKey) {
    const existing = await getResearchRunByKey(brandId, idempotencyKey);
    if (existing) {
      if (existing.status === "completed") {
        return {
          runId: existing.id,
          topicsCreated: existing.topicsCreated,
          summary: existing.summary ?? "",
        };
      }
      await deleteResearchTopicsForRun(existing.id);
      run = existing;
    }
  }
  if (!run) {
    run = await createResearchRun(scope, idempotencyKey);
  }

  const job = await createAgentJob(scope, "research", "Research run started");

  try {
    const [brand, competitors, existingTitles] = await Promise.all([
      getBrandProfile(brandId),
      listCompetitors(brandId),
      listTopicTitles(brandId),
    ]);

    const context = buildResearchContext(
      {
        productDescription: brand?.productDescription,
        audience: brand?.audience,
        tone: brand?.tone,
        website: brand?.website,
        seedKeywords: brand?.seedKeywords,
      },
      competitors.map((item) => ({
        name: item.name,
        url: item.url,
        rssUrl: item.rssUrl,
        sitemapUrl: item.sitemapUrl,
      })),
    );

    const providerResults = await Promise.all(
      researchProviders.flatMap((provider) =>
        provider.isAvailable()
          ? [
              provider.discover(context).then((findings) => ({
                provider: provider.id,
                findings,
              })),
            ]
          : [],
      ),
    );

    const findings: ResearchFinding[] = uniqueByTitle(
      providerResults.flatMap((result) => result.findings),
    );

    const existing = new Set(existingTitles.map((title) => title.toLowerCase()));
    const novelFindings = findings.filter(
      (finding) => !existing.has(finding.title.toLowerCase()),
    );

    const { topics: scoredTopics, tokenUsage } = await scoreFindings(novelFindings, context);
    const created = await createResearchTopics(scope, run.id, scoredTopics);

    const summary = `Found ${findings.length} signals, kept ${created.length} ranked topics after scoring and deduplication.`;
    await completeResearchRun(run.id, {
      status: "completed",
      summary,
      findingsJson: JSON.stringify({ providers: providerResults.map((r) => r.provider), count: findings.length }),
      topicsCreated: created.length,
    });

    await finishAgentJob(job.id, "completed", summary, {
      researchRunId: run.id,
      topicsCreated: created.length,
      tokenUsage,
    });

    logInfo("research.completed", {
      workspaceId,
      runId: run.id,
      topicsCreated: created.length,
      totalTokens: tokenUsage.totalTokens,
    });

    return { runId: run.id, topicsCreated: created.length, summary };
  } catch (error) {
    // Store a user-friendly summary (shown in the activity feed); keep the raw
    // error in the logs only.
    const detail = error instanceof Error ? error.message : "Unknown error";
    const friendly = "Research failed — retry to try again.";
    await completeResearchRun(run.id, {
      status: "failed",
      summary: friendly,
      findingsJson: "{}",
      topicsCreated: 0,
    });
    await finishAgentJob(job.id, "failed", friendly);
    logError("research.failed", { workspaceId, runId: run.id, error: detail });
    throw error;
  }
}
