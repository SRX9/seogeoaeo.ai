import { z } from "zod";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import {
  INTEGRATION_PROVIDER_IDS,
  IntegrationValidationError,
  validateIntegrationConfigInput,
  validateIntegrationSecretsInput,
} from "@/lib/integrations/providers";
import {
  clearIntegration,
  listIntegrations,
  saveIntegrationSecret,
  setIntegrationEnabled,
  updateIntegrationConfig,
} from "@/lib/integrations/repository";
import { errorFields, logError, logInfo, logWarn } from "@/lib/logging/logger";

const providerSchema = z.enum(INTEGRATION_PROVIDER_IDS);

const saveSchema = z.object({
  provider: providerSchema,
  config: z.record(z.unknown()).optional(),
  secrets: z.record(z.unknown()).optional(),
});

const providerBodySchema = z.object({ provider: providerSchema });

function invalidIntegrationInput(error: unknown): never {
  if (error instanceof IntegrationValidationError) {
    throw new HttpError(400, error.message, error.details);
  }
  throw error;
}

function integrationLogFields(
  scope: { workspaceId: string; brandId: string },
  provider: z.infer<typeof providerSchema>,
  operation: "disconnect" | "enable" | "save",
) {
  return {
    workspaceId: scope.workspaceId,
    brandId: scope.brandId,
    provider,
    operation,
  };
}

async function integrationProviderFromDeleteRequest(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");
  if (provider !== null) {
    return parseBody(providerBodySchema, { provider }).provider;
  }

  return parseBody(providerBodySchema, await readJson(request)).provider;
}

/** List all integration providers and their state for the active brand. */
export async function GET() {
  return handleApi(async () => {
    const { brand, scope } = await requireApiBrand();
    try {
      const integrations = await listIntegrations(brand.id);
      return jsonOk({ integrations });
    } catch (error) {
      logError("integration.list_failed", {
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        ...errorFields(error),
      });
      throw error;
    }
  });
}

/** Enable/disable a provider. */
export async function PATCH(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const { provider, enabled } = parseBody(
      z.object({ provider: providerSchema, enabled: z.boolean() }),
      await readJson(request),
    );

    if (enabled) {
      let integrations: Awaited<ReturnType<typeof listIntegrations>>;
      try {
        integrations = await listIntegrations(scope.brandId);
      } catch (error) {
        logError("integration.configuration_failed", {
          ...integrationLogFields(scope, provider, "enable"),
          enabled,
          failure_stage: "readiness_check",
          ...errorFields(error),
        });
        throw error;
      }
      const integration = integrations.find((item) => item.provider === provider);
      if (!integration?.requirementsMet) {
        logWarn("integration.configuration_rejected", {
          ...integrationLogFields(scope, provider, "enable"),
          reason_code: "requirements_unmet",
        });
        throw new HttpError(400, "Complete required setup before enabling this integration.", {
          code: "INTEGRATION_REQUIREMENTS_UNMET",
        });
      }
    }

    try {
      await setIntegrationEnabled(scope, provider, enabled);
    } catch (error) {
      logError("integration.configuration_failed", {
        ...integrationLogFields(scope, provider, "enable"),
        enabled,
        ...errorFields(error),
      });
      throw error;
    }
    logInfo("integration.enabled_changed", {
      ...integrationLogFields(scope, provider, "enable"),
      enabled,
    });
    return jsonOk({ ok: true });
  });
}

/** Save a provider's config and/or encrypted secret values. */
export async function PUT(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const { provider, config: configInput, secrets: secretsInput } = parseBody(
      saveSchema,
      await readJson(request),
    );

    const config = (() => {
      try {
        return validateIntegrationConfigInput(provider, configInput);
      } catch (error) {
        logWarn("integration.configuration_rejected", {
          ...integrationLogFields(scope, provider, "save"),
          reason_code: "invalid_config",
          ...errorFields(error, "validation_error"),
        });
        invalidIntegrationInput(error);
      }
    })();
    const secrets = (() => {
      try {
        return validateIntegrationSecretsInput(provider, secretsInput);
      } catch (error) {
        logWarn("integration.configuration_rejected", {
          ...integrationLogFields(scope, provider, "save"),
          reason_code: "invalid_secrets",
          ...errorFields(error, "validation_error"),
        });
        invalidIntegrationInput(error);
      }
    })();

    try {
      if (configInput !== undefined) {
        await updateIntegrationConfig(scope, provider, config);
      }
      for (const [secretKey, secretValue] of Object.entries(secrets)) {
        if (secretValue) {
          await saveIntegrationSecret(scope, provider, secretKey, secretValue);
        }
      }
    } catch (error) {
      logError("integration.configuration_failed", {
        ...integrationLogFields(scope, provider, "save"),
        config_field_count: Object.keys(config).length,
        secret_field_count: Object.values(secrets).filter(Boolean).length,
        ...errorFields(error),
      });
      throw error;
    }
    logInfo("integration.configuration_saved", {
      ...integrationLogFields(scope, provider, "save"),
      config_field_count: Object.keys(config).length,
      secret_field_count: Object.values(secrets).filter(Boolean).length,
    });
    return jsonOk({ ok: true });
  });
}

/** Clear a provider's saved config/secrets and disable it. */
export async function DELETE(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const provider = await integrationProviderFromDeleteRequest(request);
    try {
      await clearIntegration(scope, provider);
    } catch (error) {
      logError("integration.configuration_failed", {
        ...integrationLogFields(scope, provider, "disconnect"),
        ...errorFields(error),
      });
      throw error;
    }
    logInfo("integration.disconnected", {
      ...integrationLogFields(scope, provider, "disconnect"),
    });
    return jsonOk({ ok: true });
  });
}
