import { getBrand, getBrandProfile, listCompetitors, type BrandScope } from "@/lib/brand/repository";
import { listUseCases } from "@/lib/brand/use-cases";
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
import { boundSupportingExcerpt } from "@/lib/grounding/evidence";
import { persistResearchEvidenceBundles } from "@/lib/grounding/service";
import { logError, logInfo } from "@/lib/logging/logger";
import { getAgentControlState } from "@/lib/agent/memory";
import { assertAgentOperationAllowed, type AgentActor } from "@/lib/agent/safety";
import { loadTrustedResearchMemory } from "@/lib/agent/memory-context";
import { validateMemoryEvidenceRefsAtExecution } from "@/lib/agent/layered-memory";

export type RunResearchOptions = {
  /**
   * Stable key (the Workflow instance id) that makes the run idempotent. A
   * retried step with the same key returns the already-completed run instead of
   * re-discovering and inserting a fresh set of duplicate topics.
   */
  idempotencyKey?: string;
  actor?: AgentActor;
};

export async function runResearch(scope: BrandScope, options: RunResearchOptions = {}) {
  const { workspaceId, brandId } = scope;
  if (options.actor === "agent") {
    const controls = await getAgentControlState(brandId);
    assertAgentOperationAllowed("observation", { actor: "agent", controls });
  }
  const idempotencyKey = options.idempotencyKey ?? null;

  // Idempotent reuse. A finished run for this key short-circuits. A stale partial
  // attempt (failed before completing) has its pending topics cleared and its row
  // reused: the unique index forbids inserting a second run with the same key.
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
      await deleteResearchTopicsForRun(scope, existing.id);
      run = existing;
    }
  }
  if (!run) {
    run = await createResearchRun(scope, idempotencyKey);
  }

  const job = await createAgentJob(scope, "research", "Research run started");

  try {
    const [brand, profile, competitors, existingTitles, useCases, trustedMemory] = await Promise.all([
      getBrand(workspaceId, brandId),
      getBrandProfile(brandId),
      listCompetitors(brandId),
      listTopicTitles(brandId),
      listUseCases(brandId, { enabledOnly: true }),
      loadTrustedResearchMemory(scope),
    ]);

    const override = <T,>(memoryValue: T | null | undefined, profileValue: T | null | undefined) =>
      memoryValue === undefined ? profileValue : memoryValue;

    const context = buildResearchContext(
      {
        name: override(trustedMemory.overrides.name, brand?.name),
        productDescription: override(
          trustedMemory.overrides.productDescription,
          profile?.productDescription,
        ),
        audience: override(trustedMemory.overrides.audience, profile?.audience),
        tone: override(trustedMemory.overrides.tone, profile?.tone),
        website: override(trustedMemory.overrides.website, profile?.website),
        seedKeywords: override(
          trustedMemory.overrides.seedKeywords,
          profile?.seedKeywords,
        ),
      },
      competitors.map((item) => ({
        name: item.name,
        url: item.url,
        rssUrl: item.rssUrl,
        sitemapUrl: item.sitemapUrl,
      })),
      {
        useCases: useCases.map((row) => ({
          job: row.job,
          persona: row.persona,
          industry: row.industry,
        })),
        ourTitles: existingTitles,
        scope,
      },
    );

    const providerResults = await Promise.all(
      researchProviders.flatMap((provider) =>
        provider.isAvailable()
          ? [
              provider
                .discover(context)
                .then((findings) => ({ provider: provider.id, findings }))
                .catch((error) => {
                  // One provider failing (transient LLM/DB/network error) must not
                  // sink the whole run: drop its findings and keep the rest.
                  logError("research.provider_failed", {
                    workspaceId,
                    provider: provider.id,
                    error: error instanceof Error ? error.message : String(error),
                  });
                  return { provider: provider.id, findings: [] as ResearchFinding[] };
                }),
            ]
          : [],
      ),
    );

    // Keep duplicate discoveries through scoring: scoreFindings uses them to
    // preserve corroborating evidence and apply its independent-source boost.
    const findings: ResearchFinding[] = providerResults
      .flatMap((result) => result.findings)
      .map((finding) => ({
        ...finding,
        snippet: finding.snippet
          ? boundSupportingExcerpt(finding.snippet)
          : undefined,
        evidenceSources: finding.evidenceSources?.map((source) => ({
          ...source,
          excerpt: source.excerpt
            ? boundSupportingExcerpt(source.excerpt)
            : undefined,
        })),
      }));

    const existing = new Set(existingTitles.map((title) => title.toLowerCase()));
    const novelFindings = findings.filter(
      (finding) => !existing.has(finding.title.toLowerCase()),
    );

    // Persist the raw evidence score. The daily production selector applies a
    // threshold-qualified source weight exactly once at the execution boundary.
    const { topics: scoredTopics, tokenUsage } = await scoreFindings(novelFindings, context);
    const beforeInsert = await validateMemoryEvidenceRefsAtExecution(
      scope,
      trustedMemory.evidenceRefs,
      { consumer: "research" },
    );
    if (!beforeInsert.valid) {
      throw new Error(`Research memory changed before topic creation: ${beforeInsert.reason}`);
    }
    const created = await createResearchTopics(scope, run.id, scoredTopics, {
      memoryEvidenceRefs: trustedMemory.evidenceRefs,
    });
    const afterInsert = await validateMemoryEvidenceRefsAtExecution(
      scope,
      trustedMemory.evidenceRefs,
      { consumer: "research" },
    );
    if (!afterInsert.valid) {
      await deleteResearchTopicsForRun(scope, run.id);
      throw new Error(`Research memory changed during topic creation: ${afterInsert.reason}`);
    }
    await persistResearchEvidenceBundles(scope, run.id, created, scoredTopics);

    const summary = `Found ${findings.length} signals, kept ${created.length} ranked topics after scoring and deduplication.`;
    await completeResearchRun(run.id, {
      status: "completed",
      summary,
      findingsJson: JSON.stringify({
        providers: providerResults.map((r) => r.provider),
        count: findings.length,
        memoryEvidenceRefs: trustedMemory.evidenceRefs,
      }),
      topicsCreated: created.length,
    });

    await finishAgentJob(job.id, "completed", summary, {
      researchRunId: run.id,
      topicsCreated: created.length,
      tokenUsage,
      memoryEvidenceRefs: trustedMemory.evidenceRefs,
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
    const friendly = "Research failed: retry to try again.";
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
