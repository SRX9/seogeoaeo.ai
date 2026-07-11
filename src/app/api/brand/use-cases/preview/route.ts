import { z } from "zod";
import { optionalHttpUrlSchema } from "@/lib/brand/schemas";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { previewUseCases } from "@/lib/brand/use-cases";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

const previewSchema = z.object({
  name: z.string().min(1).max(120),
  website: optionalHttpUrlSchema,
  productDescription: z.string().max(4000).optional().default(""),
  audience: z.string().max(500).optional().default(""),
  seedKeywords: z.string().max(1000).optional().default(""),
});

/**
 * Onboarding target-profile autofill: find likely customer and user profiles
 * from the name + AI-prefilled product profile, before any brand row exists.
 * Free (Claudia runs this once during onboarding) but rate-limited per workspace
 * since each call spends LLM + Serper budget. Returns suggestions only: the
 * client confirms them and they're persisted when the brand is created.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const input = parseBody(previewSchema, await readJson(request));

    try {
      await assertWorkspaceRateLimit(workspace.id, "use_cases_preview", 10, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "You have made several attempts. Wait a moment and try again.", { code: "RATE_LIMITED" });
      }
      throw error;
    }

    const useCases = await previewUseCases({
      name: input.name,
      website: input.website || null,
      productDescription: input.productDescription || null,
      audience: input.audience || null,
      seedKeywords: input.seedKeywords || null,
    });
    return jsonOk({ useCases });
  });
}
