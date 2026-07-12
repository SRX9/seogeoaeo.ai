import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { extractBrandDetails } from "@/lib/brand/enrich";
import { retrieveBrandIntelligence } from "@/lib/brand/intelligence";
import { brandPrefillSchema } from "@/lib/brand/schemas";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * AI brand prefill: infer the content profile (product, audience, tone, seed
 * keywords) from the name + website the user entered, before any brand row is
 * created. Free tier, but rate-limited per workspace since each call spends
 * LLM + Serper budget. Returns suggestions only: the client populates the form
 * and the brand is saved later when the user finishes onboarding.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { name, website } = parseBody(brandPrefillSchema, await readJson(request));

    try {
      await assertWorkspaceRateLimit(workspace.id, "brand_prefill", 10, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "You have requested several brand drafts. Wait a moment and try again.", {
          code: "RATE_LIMITED",
        });
      }
      throw error;
    }

    const [details, intelligence] = await Promise.all([
      extractBrandDetails({ name, website: website || null }),
      website ? retrieveBrandIntelligence(website).catch(() => null) : Promise.resolve(null),
    ]);
    return jsonOk({
      profile: {
        ...details,
        // Context.dev's first-party site extraction is the strongest fallback
        // when search/LLM enrichment cannot describe the product.
        productDescription: details.productDescription || intelligence?.description || "",
      },
      identity: intelligence
        ? {
            title: intelligence.title,
            slogan: intelligence.slogan,
            logoUrl: intelligence.logos[0]?.url ?? null,
            colors: intelligence.colors,
          }
        : null,
    });
  });
}
