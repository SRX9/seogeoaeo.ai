import {
  getApiContext,
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
} from "@/lib/api/server";
import { setActiveBrandCookie } from "@/lib/brand/context";
import {
  BrandExistsError,
  createBrand,
  createCompetitor,
  listBrands,
  upsertBrandProfile,
} from "@/lib/brand/repository";
import { brandOnboardingSchema } from "@/lib/brand/schemas";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";
import {
  saveIntegrationSecret,
  setIntegrationEnabled,
} from "@/lib/integrations/repository";

/** List all brands in the workspace. */
export async function GET() {
  return handleApi(async () => {
    const ctx = await getApiContext();
    const brands = await listBrands(ctx.workspace.id);
    return jsonOk({
      brands: brands.map((brand) => ({ id: brand.id, name: brand.name, createdAt: brand.createdAt })),
      activeBrandId: ctx.brand?.id ?? null,
    });
  });
}

/**
 * Multi-step "register a brand" submission. Creates the brand, its profile, an
 * optional first competitor, and an optional publishing integration, then makes
 * the new brand active.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const ctx = await getApiContext();
    const data = parseBody(brandOnboardingSchema, await readJson(request));

    let brand: Awaited<ReturnType<typeof createBrand>>;
    try {
      brand = await createBrand(ctx.workspace.id, data.name);
    } catch (error) {
      if (error instanceof BrandExistsError) {
        throw new HttpError(409, error.message, { code: "BRAND_EXISTS" });
      }
      throw error;
    }
    const scope = { workspaceId: ctx.workspace.id, brandId: brand.id };

    await upsertBrandProfile(scope, {
      productDescription: data.productDescription ?? "",
      audience: data.audience ?? "",
      tone: data.tone ?? "",
      website: data.website ?? "",
      seedKeywords: data.seedKeywords ?? "",
    });

    if (data.competitorName && data.competitorUrl) {
      await createCompetitor(scope, {
        name: data.competitorName,
        url: data.competitorUrl,
        rssUrl: "",
        sitemapUrl: "",
      });
    }

    const provider = INTEGRATION_PROVIDERS.find((item) => item.id === data.integrationProvider);
    if (provider) {
      await setIntegrationEnabled(scope, provider.id, true);
      if (data.integrationApiKey) {
        await saveIntegrationSecret(scope, provider.id, "api_key", data.integrationApiKey);
      }
    }

    await setActiveBrandCookie(brand.id);
    return jsonOk({ brand: { id: brand.id, name: brand.name } }, { status: 201 });
  });
}
