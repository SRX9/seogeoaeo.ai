import { and, eq } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentDailyRuns } from "@/lib/db/schema";

/** The state the daily agent recorded for a brand on a given UTC day. */
export type DailyRunStatus = "active" | "paused_no_credits" | "idle" | "no_topics";

export type DailyRunInput = {
  articlesWritten: number;
  topicsResearched: number;
  status: DailyRunStatus;
  note?: string | null;
};

/**
 * Write (or overwrite) the brand's row for `runDate`. Values are absolute, not
 * deltas — the daily engine computes the day's running totals and passes them in,
 * so a re-fired cron converges on the correct numbers instead of double-counting.
 */
export async function upsertDailyRun(scope: BrandScope, runDate: string, input: DailyRunInput) {
  await getDb()
    .insert(agentDailyRuns)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      runDate,
      articlesWritten: input.articlesWritten,
      topicsResearched: input.topicsResearched,
      status: input.status,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [agentDailyRuns.brandId, agentDailyRuns.runDate],
      set: {
        articlesWritten: input.articlesWritten,
        topicsResearched: input.topicsResearched,
        status: input.status,
        note: input.note ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function getDailyRun(brandId: string, runDate: string) {
  const [row] = await getDb()
    .select()
    .from(agentDailyRuns)
    .where(and(eq(agentDailyRuns.brandId, brandId), eq(agentDailyRuns.runDate, runDate)))
    .limit(1);
  return row ?? null;
}
