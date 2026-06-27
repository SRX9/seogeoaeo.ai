import { desc, eq } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { researchRuns } from "@/lib/db/schema";

export async function createResearchRun(scope: BrandScope) {
  const [run] = await getDb()
    .insert(researchRuns)
    .values({ workspaceId: scope.workspaceId, brandId: scope.brandId, status: "running" })
    .returning();
  return run;
}

export async function completeResearchRun(
  runId: string,
  input: {
    status: "completed" | "failed";
    summary: string;
    findingsJson: string;
    topicsCreated: number;
  },
) {
  await getDb()
    .update(researchRuns)
    .set({
      status: input.status,
      summary: input.summary,
      findingsJson: input.findingsJson,
      topicsCreated: input.topicsCreated,
      updatedAt: new Date(),
    })
    .where(eq(researchRuns.id, runId));
}

export async function listResearchRuns(brandId: string, limit = 5) {
  return getDb()
    .select()
    .from(researchRuns)
    .where(eq(researchRuns.brandId, brandId))
    .orderBy(desc(researchRuns.createdAt))
    .limit(limit);
}

export async function getLatestResearchRun(brandId: string) {
  const runs = await listResearchRuns(brandId, 1);
  return runs[0] ?? null;
}
