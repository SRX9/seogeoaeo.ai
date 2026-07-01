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
import {
  emptySecretStates,
  getIntegrationProvider,
  integrationRequirementsMet,
  IntegrationValidationError,
  validateIntegrationConfigInput,
  validateIntegrationSecretsInput,
  type IntegrationConfig,
  type IntegrationProviderId,
  type IntegrationSecretKey,
} from "@/lib/integrations/providers";
import {
  saveIntegrationSecret,
  setIntegrationEnabled,
  updateIntegrationConfig,
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

type OnboardingIntegrationSetup = {
  provider: IntegrationProviderId;
  config: IntegrationConfig;
  secrets: Partial<Record<IntegrationSecretKey, string>>;
  enable: boolean;
};

function hasValues(values: Record<string, string>) {
  return Object.values(values).some((value) => value.trim().length > 0);
}

function prepareOnboardingIntegration(
  providerId: string | undefined,
  configInput: Record<string, string>,
  secretsInput: Record<string, string>,
): OnboardingIntegrationSetup | null {
  if (!providerId) {
    return null;
  }

  const provider = getIntegrationProvider(providerId);
  if (!provider || provider.status !== "available") {
    return null;
  }

  try {
    const config = validateIntegrationConfigInput(provider.id, configInput);
    const secrets = validateIntegrationSecretsInput(provider.id, secretsInput);
    const secretStates = {
      ...emptySecretStates(provider),
      ...Object.fromEntries(Object.keys(secrets).map((key) => [key, true])),
    };

    return {
      provider: provider.id,
      config,
      secrets,
      enable: integrationRequirementsMet(provider, config, secretStates),
    };
  } catch (error) {
    if (error instanceof IntegrationValidationError) {
      throw new HttpError(400, error.message, error.details);
    }
    throw error;
  }
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
    const integrationSetup = prepareOnboardingIntegration(
      data.integrationProvider,
      data.integrationConfig,
      data.integrationSecrets,
    );

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

    if (integrationSetup) {
      if (
        integrationSetup.enable ||
        Object.keys(integrationSetup.config).length > 0 ||
        hasValues(data.integrationConfig)
      ) {
        await updateIntegrationConfig(scope, integrationSetup.provider, integrationSetup.config);
      }
      for (const [secretKey, secretValue] of Object.entries(integrationSetup.secrets)) {
        if (secretValue) {
          await saveIntegrationSecret(scope, integrationSetup.provider, secretKey, secretValue);
        }
      }
      if (integrationSetup.enable) {
        await setIntegrationEnabled(scope, integrationSetup.provider, true);
      }
    }

    await setActiveBrandCookie(brand.id);
    return jsonOk({ brand: { id: brand.id, name: brand.name } }, { status: 201 });
  });
}
