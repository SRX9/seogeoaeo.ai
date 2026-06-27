import { z } from "zod";
import { handleApi, HttpError, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { isActiveSubscription } from "@/lib/billing/plans";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { assertHasCredits, InsufficientCreditsError, spendCredits } from "@/lib/usage/credits";
import { getAgentJob } from "@/lib/jobs/repository";
import { runWeeklyPipelineForBrand } from "@/lib/jobs/weekly";
import { runResearch } from "@/lib/research/run";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

const retrySchema = z.object({
  type: z.enum(["research_run", "agent_job"]),
  id: z.string().optional(),
});

function parseMetadata(raw: string | null) {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Retry a failed activity item (a research run or a failed agent job). */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace, subscription, brand, scope } = await requireApiBrand();
    const { type, id } = parseBody(retrySchema, await readJson(request));
    const active = isActiveSubscription(subscription?.status);

    // Research retries cost the same as a fresh run: a failed run is never
    // charged (the spend happens only after success), so a successful retry must
    // charge too. Mirrors POST /api/research. Credit/rate-limit errors bubble to
    // the shared catch below, which maps them to 402/429.
    const retryResearchCharged = async () => {
      await assertHasCredits(workspace.id, CREDIT_COSTS.research_run);
      await assertWorkspaceRateLimit(workspace.id, "research", 10, ONE_HOUR_MS);
      const { runId } = await runResearch(scope);
      await spendCredits(workspace.id, CREDIT_COSTS.research_run, {
        reason: "research_run",
        brandId: brand.id,
        refType: "research_run",
        refId: runId,
      });
    };

    try {
      if (type === "research_run") {
        await retryResearchCharged();
        return jsonOk({ ok: true });
      }

      if (!id) {
        throw new HttpError(400, "Missing job id");
      }
      const job = await getAgentJob(brand.id, id);
      if (!job || job.status !== "failed") {
        throw new HttpError(409, "This job can no longer be retried");
      }

      const metadata = parseMetadata(job.metadataJson);
      if (job.kind === "research") {
        await retryResearchCharged();
      } else if (job.kind === "writing" && typeof metadata.topicId === "string") {
        await assertWorkspaceRateLimit(workspace.id, "generate_article", 20, ONE_HOUR_MS);
        await generateArticleFromTopic(scope, metadata.topicId, { forceDraft: !active });
      } else if (job.kind === "weekly_pipeline") {
        if (!active) {
          throw new HttpError(402, "The weekly pipeline requires an active plan", {
            code: "UPGRADE_REQUIRED",
          });
        }
        await runWeeklyPipelineForBrand(scope);
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Too many retries — try again later", { code: "RATE_LIMITED" });
      }
      if (error instanceof InsufficientCreditsError) {
        throw new HttpError(402, "Not enough credits to retry this job", {
          code: "INSUFFICIENT_CREDITS",
        });
      }
      throw error;
    }

    return jsonOk({ ok: true });
  });
}
