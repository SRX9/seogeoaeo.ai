import { and, desc, eq } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentJobs } from "@/lib/db/schema";

export type JobKind = "research" | "writing" | "weekly_pipeline";
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
