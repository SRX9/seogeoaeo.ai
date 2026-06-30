"use server";

import { revalidatePath } from "next/cache";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { isActiveSubscription } from "@/lib/billing/plans";
import { requireBrand } from "@/lib/brand/context";
import { getAgentJob } from "@/lib/jobs/repository";
import { runResearch } from "@/lib/research/run";
import { assertWorkspaceRateLimit } from "@/lib/security/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

function parseMetadata(raw: string | null) {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function retryResearchAction(): Promise<void> {
  const { workspace, scope } = await requireBrand();
  await assertWorkspaceRateLimit(workspace.id, "research", 10, ONE_HOUR_MS);
  await runResearch(scope);
  revalidatePath("/activity");
  revalidatePath("/dashboard");
  revalidatePath("/topics");
}

export async function retryAgentJobAction(jobId: string): Promise<void> {
  const { workspace, subscription, brand, scope } = await requireBrand();
  const job = await getAgentJob(brand.id, jobId);

  if (!job || job.status !== "failed") {
    return;
  }

  const metadata = parseMetadata(job.metadataJson);
  const active = isActiveSubscription(subscription?.status);

  if (job.kind === "research") {
    await assertWorkspaceRateLimit(workspace.id, "research", 10, ONE_HOUR_MS);
    await runResearch(scope);
  } else if (job.kind === "writing" && typeof metadata.topicId === "string") {
    // Generation is credit-gated; the article stays a draft without a plan.
    await assertWorkspaceRateLimit(workspace.id, "generate_article", 20, ONE_HOUR_MS);
    await generateArticleFromTopic(scope, metadata.topicId, { forceDraft: !active });
  }

  revalidatePath("/activity");
  revalidatePath("/dashboard");
  revalidatePath("/topics");
  revalidatePath("/articles");
}
