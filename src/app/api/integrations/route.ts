import { z } from "zod";
import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import {
  listIntegrations,
  saveIntegrationSecret,
  setIntegrationEnabled,
  updateIntegrationConfig,
} from "@/lib/integrations/repository";

const providerSchema = z.enum([
  "markdown_export",
  "webhook",
  "devto",
  "hashnode",
  "wordpress",
  "ghost",
]);

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || isUrl(value), "Must be a valid URL")
  .optional();

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const saveSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().max(400).optional(),
  config: z
    .object({
      webhookUrl: optionalUrl,
      siteUrl: optionalUrl,
      username: z.string().max(200).optional(),
      publicationId: z.string().max(200).optional(),
      adminApiUrl: optionalUrl,
    })
    .optional(),
});

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
    await setIntegrationEnabled(scope, provider, enabled);
    return jsonOk({ ok: true });
  });
}

/** Save a provider's config and/or API key. */
export async function PUT(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const { provider, apiKey, config } = parseBody(saveSchema, await readJson(request));

    if (config && Object.keys(config).length > 0) {
      await updateIntegrationConfig(scope, provider, config);
    }
    if (apiKey && apiKey.trim()) {
      await saveIntegrationSecret(scope, provider, "api_key", apiKey.trim());
    }
    return jsonOk({ ok: true });
  });
}
