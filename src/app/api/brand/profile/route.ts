import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { getBrandProfile, upsertBrandProfile } from "@/lib/brand/repository";
import { brandProfileSchema } from "@/lib/brand/schemas";
import { listUseCases, syncUseCases } from "@/lib/brand/use-cases";
import { logWarn } from "@/lib/logging/logger";

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

    // C1: Claudia maps the product's use cases right after the profile is
    // saved (onboarding) and re-maps when the description changes. Additive —
    // user rows and edits are preserved. Never fail the save over it.
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
