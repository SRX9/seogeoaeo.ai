import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { listAgentJobs } from "@/lib/jobs/repository";
import { listResearchRuns } from "@/lib/research/repository";
import { creditsForRefs, listCompetitorDiscoveries } from "@/lib/usage/credits";

/** The article id a writing job produced, stored on its finish metadata. */
function writingArticleId(job: { kind: string; metadataJson: string | null }): string | null {
  if (job.kind !== "writing" || !job.metadataJson) return null;
  try {
    return (JSON.parse(job.metadataJson) as { articleId?: string }).articleId ?? null;
  } catch {
    return null;
  }
}

/**
 * Activity timeline: research runs, agent jobs, and competitor discoveries for
 * the active brand, each annotated with the credits it spent. Credits are looked
 * up from the ledger by the ref each row owns — research runs by run id, writing
 * jobs by their article id. Competitor discoveries leave no job/run record, so
 * they come straight from their ledger spends.
 */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const [allJobs, runs, competitorSpends] = await Promise.all([
      listAgentJobs(brand.id, 20),
      listResearchRuns(brand.id, 10),
      listCompetitorDiscoveries(brand.id, 10),
    ]);

    // A research run already shows as its own row, so drop the duplicate
    // "research" agent job runResearch creates alongside it.
    const jobs = allJobs.filter((job) => job.kind !== "research");

    const articleIdByJob = new Map<string, string>();
    for (const job of jobs) {
      const articleId = writingArticleId(job);
      if (articleId) articleIdByJob.set(job.id, articleId);
    }

    const credits = await creditsForRefs(brand.id, [
      ...runs.map((run) => run.id),
      ...articleIdByJob.values(),
    ]);

    const enrichedJobs = jobs.map((job) => {
      const articleId = articleIdByJob.get(job.id);
      return { ...job, creditsSpent: articleId ? (credits.get(articleId) ?? 0) : 0 };
    });
    const enrichedRuns = runs.map((run) => ({ ...run, creditsSpent: credits.get(run.id) ?? 0 }));
    const competitors = competitorSpends.map((spend) => ({
      id: spend.id,
      status: "completed",
      createdAt: spend.createdAt,
      creditsSpent: Math.abs(spend.delta),
    }));

    return jsonOk({ jobs: enrichedJobs, runs: enrichedRuns, competitors });
  });
}
