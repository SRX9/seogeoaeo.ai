import {
  getApiContext,
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
} from "@/lib/api/server";
import { isActiveSubscription } from "@/lib/billing/plans";
import { setActiveBrandCookie } from "@/lib/brand/context";
import {
  BrandExistsError,
  createBrand,
  createCompetitors,
  listBrands,
  upsertBrandProfile,
} from "@/lib/brand/repository";
import { createUseCase } from "@/lib/brand/use-cases";
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

/** Hostname without a leading "www.", for deduping competitor URLs. */
function safeHost(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
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
      brand = await createBrand(ctx.workspace.id, data.name, data.autonomyMode);
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

    // Competitors picked from onboarding's AI discovery (plus any legacy single
    // entry), deduped by host and bulk-inserted. Best-effort enrichment — a
    // failure here must never fail brand creation.
    const competitorInputs = [
      ...(data.competitors ?? []),
      ...(data.competitorName && data.competitorUrl
        ? [{ name: data.competitorName, url: data.competitorUrl }]
        : []),
    ];
    const seenHosts = new Set<string>();
    const dedupedCompetitors = competitorInputs.filter((competitor) => {
      const key = safeHost(competitor.url) ?? competitor.url.toLowerCase();
      if (seenHosts.has(key)) {
        return false;
      }
      seenHosts.add(key);
      return true;
    });
    if (dedupedCompetitors.length > 0) {
      try {
        await createCompetitors(
          scope,
          dedupedCompetitors.map((competitor) => ({
            name: competitor.name,
            url: competitor.url,
            rssUrl: "",
            sitemapUrl: "",
          })),
        );
      } catch (error) {
        console.error("[brands] competitor seeding failed", error);
      }
    }

    // Use cases confirmed on onboarding's autofill step — seed the C1 inventory
    // so BOFU topic mining has buyer jobs to work from on day one.
    for (const useCase of data.useCases ?? []) {
      try {
        await createUseCase(
          scope,
          { job: useCase.job, persona: useCase.persona, industry: useCase.industry || null },
          "generated",
        );
      } catch (error) {
        console.error("[brands] use-case seeding failed", error);
      }
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
    // Ignition readiness (AP2): with an active subscription the client kicks off
    // Claudia's Setup Run immediately; otherwise it routes to plan selection.
    return jsonOk(
      {
        brand: { id: brand.id, name: brand.name },
        canIgnite: isActiveSubscription(ctx.subscription?.status),
      },
      { status: 201 },
    );
  });
}
