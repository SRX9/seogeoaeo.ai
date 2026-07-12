import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { getBrandProfile, upsertBrandProfile } from "@/lib/brand/repository";
import { brandProfileSchema } from "@/lib/brand/schemas";
import { listUseCases, syncUseCases } from "@/lib/brand/use-cases";
import { logWarn } from "@/lib/logging/logger";
import {
  clearBrandIntelligence,
  domainFromWebsite,
  isBrandIntelligenceConfigured,
  refreshBrandIntelligence,
} from "@/lib/brand/intelligence";

/** Get the active brand's profile (always returns string fields, never null). */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const profile = await getBrandProfile(brand.id);
    return jsonOk({
      profile: {
        productDescription: profile?.productDescription ?? "",
        audience: profile?.audience ?? "",
        tone: profile?.tone ?? "",
        website: profile?.website ?? "",
        seedKeywords: profile?.seedKeywords ?? "",
      },
    });
  });
}

/** Create or update the active brand's profile. */
export async function PUT(request: Request) {
  return handleApi(async () => {
    const { scope, brand } = await requireApiBrand();
    const data = parseBody(brandProfileSchema, await readJson(request));
    const previous = await getBrandProfile(brand.id);
    await upsertBrandProfile(scope, {
      productDescription: data.productDescription ?? "",
      audience: data.audience ?? "",
      tone: data.tone ?? "",
      website: data.website ?? "",
      seedKeywords: data.seedKeywords ?? "",
    });

    const previousDomain = domainFromWebsite(previous?.website ?? "");
    const nextDomain = domainFromWebsite(data.website ?? "");
    if (previousDomain !== nextDomain) {
      if (nextDomain && isBrandIntelligenceConfigured()) {
        try {
          await refreshBrandIntelligence(scope, data.website ?? "", { force: true });
        } catch (error) {
          await clearBrandIntelligence(brand.id);
          logWarn("brand_intelligence.website_refresh_failed", {
            brandId: brand.id,
            reason: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } else {
        await clearBrandIntelligence(brand.id);
      }
    }

    // C1: Claudia finds target customer/user profiles right after the profile is
    // saved (onboarding) and refreshes them when the description changes.
    // Additive: user rows and edits are preserved. Never fail the save over it.
    const descriptionChanged =
      (previous?.productDescription ?? "") !== (data.productDescription ?? "");
    if (data.productDescription && (descriptionChanged || previous === null)) {
      try {
        const existing = await listUseCases(brand.id);
        if (existing.length === 0 || descriptionChanged) {
          await syncUseCases(scope);
        }
      } catch (error) {
        logWarn("use_cases.sync_skipped", {
          brandId: brand.id,
          reason: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    return jsonOk({ ok: true });
  });
}
