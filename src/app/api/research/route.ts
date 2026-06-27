import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { assertHasCredits, InsufficientCreditsError, spendCredits } from "@/lib/usage/credits";
import { getLatestResearchRun, listResearchRuns } from "@/lib/research/repository";
import { runResearch } from "@/lib/research/run";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Latest research run + recent history for the active brand. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const runs = await listResearchRuns(brand.id, 5);
    return jsonOk({ latest: runs[0] ?? null, runs });
  });
}

/** Kick off a research pass (rate limited per workspace). */
export async function POST() {
  return handleApi(async () => {
    const { workspace, brand, scope } = await requireApiBrand();
    const cost = CREDIT_COSTS.research_run;

    try {
      await assertHasCredits(workspace.id, cost);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new HttpError(402, "Not enough credits to run research", {
          code: "INSUFFICIENT_CREDITS",
        });
      }
      throw error;
    }

    try {
      await assertWorkspaceRateLimit(workspace.id, "research", 10, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Too many research runs — try again later", { code: "RATE_LIMITED" });
      }
      throw error;
    }

    const { runId } = await runResearch(scope);
    // Charge only after the run succeeds so failed research never burns credits.
    await spendCredits(workspace.id, cost, {
      reason: "research_run",
      brandId: brand.id,
      refType: "research_run",
      refId: runId,
    });
    const latest = await getLatestResearchRun(brand.id);
    return jsonOk({ latest });
  });
}
