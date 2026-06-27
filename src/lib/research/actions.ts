"use server";

import { revalidatePath } from "next/cache";
import { requireBrand } from "@/lib/brand/context";
import { runResearch } from "@/lib/research/run";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { logWarn } from "@/lib/logging/logger";

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function runResearchAction(): Promise<void> {
  const { workspace, scope } = await requireBrand();

  try {
    await assertWorkspaceRateLimit(workspace.id, "research", 10, ONE_HOUR_MS);
  } catch (error) {
    if (error instanceof RateLimitError) {
      logWarn("rate_limit.research", { workspaceId: workspace.id });
      return;
    }
    throw error;
  }

  await runResearch(scope);
  revalidatePath("/dashboard");
  revalidatePath("/topics");
  revalidatePath("/activity");
}
