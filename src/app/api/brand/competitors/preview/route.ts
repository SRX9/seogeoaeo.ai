import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { discoverCompetitors } from "@/lib/brand/enrich";
import { MAX_COMPETITORS, optionalHttpUrlSchema } from "@/lib/brand/schemas";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

/** How many rivals the onboarding autofill surfaces for review. */
const PREVIEW_LIMIT = 6;

const previewSchema = z.object({
  name: z.string().min(1).max(120),
  website: optionalHttpUrlSchema,
  productDescription: z.string().max(4000).optional().default(""),
  seedKeywords: z.string().max(1000).optional().default(""),
});

/**
 * Onboarding competitor autofill: discover rivals from the entered/AI-prefilled
 * profile, before any brand row exists. Free (Claudia runs this once during
 * onboarding) but rate-limited per workspace since each call spends LLM + Serper
 * budget. Returns suggestions only — the client shows a checklist and the picked
 * ones are persisted when the brand is created.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const input = parseBody(previewSchema, await readJson(request));

    try {
      await assertWorkspaceRateLimit(workspace.id, "competitors_preview", 10, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Too many attempts — try again later", { code: "RATE_LIMITED" });
      }
      throw error;
    }

    const suggestions = await discoverCompetitors(
      {
        name: input.name,
        website: input.website || null,
        productDescription: input.productDescription || null,
        seedKeywords: input.seedKeywords || null,
      },
      Math.min(MAX_COMPETITORS, PREVIEW_LIMIT),
    );
    return jsonOk({ suggestions });
  });
}
