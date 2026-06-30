import { and, desc, eq } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { researchRuns } from "@/lib/db/schema";

export async function createResearchRun(scope: BrandScope, idempotencyKey?: string | null) {
  const [run] = await getDb()
    .insert(researchRuns)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      status: "running",
      idempotencyKey: idempotencyKey ?? null,
    })
    .returning();
  return run;
}

/** Look up a prior run created under the same idempotency key for this brand. */
export async function getResearchRunByKey(brandId: string, idempotencyKey: string) {
  const [run] = await getDb()
    .select()
    .from(researchRuns)
    .where(and(eq(researchRuns.brandId, brandId), eq(researchRuns.idempotencyKey, idempotencyKey)))
    .limit(1);
  return run ?? null;
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
