import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentJobs, usageCounters } from "@/lib/db/schema";
import { getWeekStart } from "@/lib/workspace/settings";

export type JobKind = "research" | "writing" | "weekly_pipeline" | "daily_pipeline";
export type JobStatus = "running" | "completed" | "failed";

export async function createAgentJob(scope: BrandScope, kind: JobKind, message?: string) {
  const [job] = await getDb()
    .insert(agentJobs)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      kind,
      status: "running",
      message: message ?? null,
    })
    .returning();
  return job;
}

export async function finishAgentJob(
  jobId: string,
  status: JobStatus,
  message: string,
  metadata?: Record<string, unknown>,
) {
  await getDb()
    .update(agentJobs)
    .set({
      status,
      message,
      metadataJson: metadata ? JSON.stringify(metadata) : null,
      updatedAt: new Date(),
    })
    .where(eq(agentJobs.id, jobId));
}

export async function listAgentJobs(brandId: string, limit = 20) {
  return getDb()
    .select()
    .from(agentJobs)
    .where(eq(agentJobs.brandId, brandId))
    .orderBy(desc(agentJobs.createdAt))
    .limit(limit);
}

export async function getAgentJob(brandId: string, jobId: string) {
  const [job] = await getDb()
    .select()
    .from(agentJobs)
    .where(and(eq(agentJobs.brandId, brandId), eq(agentJobs.id, jobId)))
    .limit(1);
  return job ?? null;
}

export type WeeklyRunSummary = {
  status: JobStatus;
  createdAt: Date;
  /** Articles the run generated (length of generatedArticleIds in the metadata). */
  articlesGenerated: number;
  /** New topics research added during the run. */
  topicsResearched: number;
};

export type WeeklyPipelineStats = {
  lastRun: WeeklyRunSummary | null;
  /** Auto-runs recorded for this brand (capped at the recent window below). */
  totalRuns: number;
  /** Articles produced across those auto-runs. */
  totalArticlesGenerated: number;
};

/** How far back we scan weekly_pipeline jobs for the overview metrics. */
const WEEKLY_STATS_WINDOW = 100;

function parseWeeklyMetadata(metadataJson: string | null) {
  if (!metadataJson) return { articlesGenerated: 0, topicsResearched: 0 };
  try {
    const meta = JSON.parse(metadataJson) as {
      // Weekly runs record the full id list; daily runs record a count.
      generatedArticleIds?: string[];
      generatedCount?: number;
      researchTopics?: number;
    };
    return {
      articlesGenerated: meta.generatedArticleIds?.length ?? meta.generatedCount ?? 0,
      topicsResearched: meta.researchTopics ?? 0,
    };
  } catch {
    return { articlesGenerated: 0, topicsResearched: 0 };
  }
}

/**
 * Aggregate stats for the automated content agent (daily + legacy weekly runs),
 * used to surface auto-run health on the overview. Scans the most recent
 * {@link WEEKLY_STATS_WINDOW} runs.
 */
export async function getWeeklyPipelineStats(brandId: string): Promise<WeeklyPipelineStats> {
  const runs = await getDb()
    .select()
    .from(agentJobs)
    .where(
      and(
        eq(agentJobs.brandId, brandId),
        inArray(agentJobs.kind, ["daily_pipeline", "weekly_pipeline"]),
      ),
    )
    .orderBy(desc(agentJobs.createdAt))
    .limit(WEEKLY_STATS_WINDOW);

  let totalArticlesGenerated = 0;
  for (const run of runs) {
    totalArticlesGenerated += parseWeeklyMetadata(run.metadataJson).articlesGenerated;
  }

  const latest = runs[0];
  const lastRun: WeeklyRunSummary | null = latest
    ? {
        status: latest.status as JobStatus,
        createdAt: latest.createdAt,
        ...parseWeeklyMetadata(latest.metadataJson),
      }
    : null;

  return { lastRun, totalRuns: runs.length, totalArticlesGenerated };
}

// ---- Usage counters: durable per-week tally of the content the app produces --
// These survive beyond the weekly_pipeline metadata window and capture publishes
// (which the job metadata never recorded), so the overview can show a lifetime
// "articles written / published" total for the workspace's content agent.

async function bumpUsageCounter(
  scope: BrandScope,
  column: "articlesGenerated" | "articlesPublished",
  amount: number,
) {
  if (amount <= 0) return;
  const weekStart = getWeekStart();
  // Increment the current week's row, creating it on first write. The unique
  // (brand_id, week_start) index is the conflict target.
  const set =
    column === "articlesGenerated"
      ? { articlesGenerated: sql`${usageCounters.articlesGenerated} + ${amount}`, updatedAt: new Date() }
      : { articlesPublished: sql`${usageCounters.articlesPublished} + ${amount}`, updatedAt: new Date() };

  await getDb()
    .insert(usageCounters)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      weekStart,
      articlesGenerated: column === "articlesGenerated" ? amount : 0,
      articlesPublished: column === "articlesPublished" ? amount : 0,
    })
    .onConflictDoUpdate({
      target: [usageCounters.brandId, usageCounters.weekStart],
      set,
    });
}

/** Record that the content agent wrote `amount` article(s) for a brand this week. */
export function incrementArticlesGenerated(scope: BrandScope, amount = 1) {
  return bumpUsageCounter(scope, "articlesGenerated", amount);
}

/** Record that the content agent published `amount` article(s) for a brand this week. */
export function incrementArticlesPublished(scope: BrandScope, amount = 1) {
  return bumpUsageCounter(scope, "articlesPublished", amount);
}

export type UsageTotals = {
  articlesWritten: number;
  articlesPublished: number;
  thisWeek: { articlesWritten: number; articlesPublished: number };
};

/** Lifetime + current-week article totals for a brand, from usage_counters. */
export async function getUsageTotals(brandId: string): Promise<UsageTotals> {
  const rows = await getDb()
    .select()
    .from(usageCounters)
    .where(eq(usageCounters.brandId, brandId));

  const weekStart = getWeekStart();
  const totals: UsageTotals = {
    articlesWritten: 0,
    articlesPublished: 0,
    thisWeek: { articlesWritten: 0, articlesPublished: 0 },
  };

  for (const row of rows) {
    totals.articlesWritten += row.articlesGenerated;
    totals.articlesPublished += row.articlesPublished;
    if (row.weekStart === weekStart) {
      totals.thisWeek = {
        articlesWritten: row.articlesGenerated,
        articlesPublished: row.articlesPublished,
      };
    }
  }

  return totals;
}
