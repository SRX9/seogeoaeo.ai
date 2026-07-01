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

const providerSchema = z.enum(INTEGRATION_PROVIDER_IDS);

const saveSchema = z.object({
  provider: providerSchema,
  config: z.record(z.unknown()).optional(),
  secrets: z.record(z.unknown()).optional(),
});

function invalidIntegrationInput(error: unknown): never {
  if (error instanceof IntegrationValidationError) {
    throw new HttpError(400, error.message, error.details);
  }
  throw error;
}

/** List all integration providers and their state for the active brand. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const integrations = await listIntegrations(brand.id);
    return jsonOk({ integrations });
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
      const integrations = await listIntegrations(scope.brandId);
      const integration = integrations.find((item) => item.provider === provider);
      if (!integration?.requirementsMet) {
        throw new HttpError(400, "Complete required setup before enabling this integration.", {
          code: "INTEGRATION_REQUIREMENTS_UNMET",
        });
      }
    }

    await setIntegrationEnabled(scope, provider, enabled);
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
        invalidIntegrationInput(error);
      }
    })();
    const secrets = (() => {
      try {
        return validateIntegrationSecretsInput(provider, secretsInput);
      } catch (error) {
        invalidIntegrationInput(error);
      }
    })();

    if (configInput !== undefined) {
      await updateIntegrationConfig(scope, provider, config);
    }
    for (const [secretKey, secretValue] of Object.entries(secrets)) {
      if (secretValue) {
        await saveIntegrationSecret(scope, provider, secretKey, secretValue);
      }
    }
    return jsonOk({ ok: true });
  });
}

/** Clear a provider's saved config/secrets and disable it. */
export async function DELETE(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const { provider } = parseBody(
      z.object({ provider: providerSchema }),
      await readJson(request),
    );
    await clearIntegration(scope, provider);
    return jsonOk({ ok: true });
  });
}
