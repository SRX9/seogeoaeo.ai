import { assertNoSetupRunning, handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
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
    await assertNoSetupRunning(brand.id);
    const cost = CREDIT_COSTS.research_run;

    const assertResearchAllowed = async () => {
      await assertHasCredits(workspace.id, cost);
      await assertWorkspaceRateLimit(workspace.id, "research", 10, ONE_HOUR_MS);
    };

    try {
      await assertResearchAllowed();
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new HttpError(402, "Not enough credits to run research", {
          code: "INSUFFICIENT_CREDITS",
        });
      }
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Too many research runs - try again later", {
          code: "RATE_LIMITED",
        });
      }
      throw error;
    }

    const runAndCharge = async () => {
      const { runId } = await runResearch(scope);
      // Charge only after the run succeeds so failed research never burns credits.
      await spendCredits(workspace.id, cost, {
        reason: "research_run",
        brandId: brand.id,
        refType: "research_run",
        refId: runId,
      });
      return getLatestResearchRun(brand.id);
    };

    const latest = await runAndCharge();
    return jsonOk({ latest });
  });
}
