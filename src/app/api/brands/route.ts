import {
  getApiContext,
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
} from "@/lib/api/server";
import { z } from "zod";
import { isActiveSubscription } from "@/lib/billing/plans";
import { setActiveBrandCookie } from "@/lib/brand/context";
import {
  BrandExistsError,
  createBrand,
  createCompetitors,
  getBrandByName,
  listBrands,
  listCompetitors,
  upsertBrandProfile,
} from "@/lib/brand/repository";
import { createUseCase, listUseCases } from "@/lib/brand/use-cases";
import { brandOnboardingSchema } from "@/lib/brand/schemas";
import {
  isBrandIntelligenceConfigured,
  refreshBrandIntelligence,
} from "@/lib/brand/intelligence";
import {
  isSetupRunStale,
  startSetupRun,
  triggerSetupRun,
} from "@/lib/jobs/setup-run";
import { getStripe } from "@/lib/billing/stripe";
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

const createBrandSchema = brandOnboardingSchema.extend({
  /**
   * Stripe-return finalization is replayable: React Strict Mode, bfcache, user
   * retries, or a lost response can send the same draft again after the brand
   * row already exists. Normal "add brand" submits keep duplicate-name errors.
   */
  resumeExisting: z.boolean().optional().default(false),
  checkoutSessionId: z.string().max(255).optional(),
});

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

function onboardingUseCaseKey(job: string, persona: string) {
  return `${job.trim().toLowerCase()}::${persona.trim().toLowerCase()}`;
}

async function seedOnboardingCompetitors(
  scope: { workspaceId: string; brandId: string },
  inputs: { name: string; url: string }[],
) {
  const existing = await listCompetitors(scope.brandId);
  const seenHosts = new Set(
    existing.map((competitor) => safeHost(competitor.url) ?? competitor.url.toLowerCase()),
  );
  const deduped = inputs.filter((competitor) => {
    const key = safeHost(competitor.url) ?? competitor.url.toLowerCase();
    if (seenHosts.has(key)) {
      return false;
    }
    seenHosts.add(key);
    return true;
  });

  if (deduped.length === 0) return;

  await createCompetitors(
    scope,
    deduped.map((competitor) => ({
      name: competitor.name,
      url: competitor.url,
      rssUrl: "",
      sitemapUrl: "",
    })),
  );
}

async function seedOnboardingUseCases(
  scope: { workspaceId: string; brandId: string },
  inputs: { job: string; persona: string; industry?: string | null }[],
) {
  const existing = await listUseCases(scope.brandId);
  const known = new Set(
    existing.map((useCase) => onboardingUseCaseKey(useCase.job, useCase.persona)),
  );

  for (const useCase of inputs) {
    const key = onboardingUseCaseKey(useCase.job, useCase.persona);
    if (known.has(key)) continue;
    known.add(key);
    await createUseCase(
      scope,
      { job: useCase.job, persona: useCase.persona, industry: useCase.industry || null },
      "generated",
    );
  }
}

async function igniteSetupRunForBrand(
  scope: { workspaceId: string; brandId: string },
  planId: string | null | undefined,
) {
  const { run, created } = await startSetupRun(scope);
  if (created || run.status === "failed" || isSetupRunStale(run)) {
    await triggerSetupRun(scope, planId, run, { resume: !created });
  }
  return { id: run.id, status: run.status };
}

async function canResumeExistingBrand(
  workspaceId: string,
  userId: string,
  brand: NonNullable<Awaited<ReturnType<typeof getBrandByName>>>,
  checkoutSessionId: string | undefined,
) {
  if (!checkoutSessionId?.startsWith("cs_")) {
    return false;
  }

  try {
    const checkoutSession = await getStripe().checkout.sessions.retrieve(checkoutSessionId);
    const sessionCreatedAt = checkoutSession.created * 1000;
    const brandCreatedAt = brand.createdAt.getTime();

    return (
      checkoutSession.status === "complete" &&
      checkoutSession.metadata?.workspaceId === workspaceId &&
      checkoutSession.metadata?.userId === userId &&
      brandCreatedAt >= sessionCreatedAt
    );
  } catch {
    return false;
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
    const data = parseBody(createBrandSchema, await readJson(request));
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
        if (!data.resumeExisting) {
          throw new HttpError(409, error.message, { code: "BRAND_EXISTS" });
        }
        const existing = await getBrandByName(ctx.workspace.id, data.name);
        if (!existing) {
          throw new HttpError(409, error.message, { code: "BRAND_EXISTS" });
        }
        const canResume = await canResumeExistingBrand(
          ctx.workspace.id,
          ctx.session.user.id,
          existing,
          data.checkoutSessionId,
        );
        if (!canResume) {
          throw new HttpError(409, error.message, { code: "BRAND_EXISTS" });
        }
        brand = existing;
      } else {
        throw error;
      }
    }
    const scope = { workspaceId: ctx.workspace.id, brandId: brand.id };

    await upsertBrandProfile(scope, {
      productDescription: data.productDescription ?? "",
      audience: data.audience ?? "",
      tone: data.tone ?? "",
      website: data.website ?? "",
      seedKeywords: data.seedKeywords ?? "",
    });

    // The prefill route normally warmed the 30-day domain cache, making this a
    // cheap local read. If it did not run, do one best-effort Context.dev lookup
    // now so the first dashboard already carries the customer's visual identity.
    if (data.website && isBrandIntelligenceConfigured()) {
      try {
        await refreshBrandIntelligence(scope, data.website);
      } catch (error) {
        console.error("[brands] brand intelligence enrichment failed", error);
      }
    }

    // Competitors picked from onboarding's AI discovery (plus any legacy single
    // entry), deduped by host and bulk-inserted. Best-effort enrichment: a
    // failure here must never fail brand creation.
    const competitorInputs = [
      ...(data.competitors ?? []),
      ...(data.competitorName && data.competitorUrl
        ? [{ name: data.competitorName, url: data.competitorUrl }]
        : []),
    ];
    if (competitorInputs.length > 0) {
      try {
        await seedOnboardingCompetitors(scope, competitorInputs);
      } catch (error) {
        console.error("[brands] competitor seeding failed", error);
      }
    }

    // Customer/user profiles confirmed on onboarding's autofill step: seed the
    // C1 inventory so BOFU topic mining has target profiles from day one.
    if (data.useCases.length > 0) {
      try {
        await seedOnboardingUseCases(scope, data.useCases);
      } catch (error) {
        console.error("[brands] target-profile seeding failed", error);
      }
    }

    if (integrationSetup) {
      try {
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
      } catch (error) {
        // Brand creation is the durable outcome. A connector can be completed
        // from Settings without making a successful brand submit unretryable.
        console.error("[brands] onboarding integration setup failed", error);
      }
    }

    await setActiveBrandCookie(brand.id);
    // Ignition readiness (AP2): start Claudia's Setup Run here with the brand id
    // we just created/selected. This avoids a second client-side request that
    // can race the active-brand cookie after Stripe redirects.
    const canIgnite = isActiveSubscription(ctx.subscription?.status);
    let setupRun: Awaited<ReturnType<typeof igniteSetupRunForBrand>> | null = null;
    if (canIgnite) {
      try {
        setupRun = await igniteSetupRunForBrand(scope, ctx.subscription?.planId);
      } catch (error) {
        // The dashboard exposes a retry/resume control; do not turn a completed
        // brand creation into a duplicate-name trap because ignition hiccupped.
        console.error("[brands] setup ignition failed", error);
      }
    }
    return jsonOk(
      {
        brand: { id: brand.id, name: brand.name },
        canIgnite,
        setupRun,
      },
      { status: 201 },
    );
  });
}
