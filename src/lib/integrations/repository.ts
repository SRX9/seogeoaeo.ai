import { and, eq } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { integrationSecrets, integrations } from "@/lib/db/schema";
import {
  INTEGRATION_PROVIDERS,
  type IntegrationConfig,
  type IntegrationProviderId,
  type IntegrationView,
} from "@/lib/integrations/providers";

function parseConfig(configJson: string | null): IntegrationConfig {
  if (!configJson) {
    return {};
  }
  try {
    return JSON.parse(configJson) as IntegrationConfig;
  } catch {
    return {};
  }
}

async function getIntegrationRow(brandId: string, provider: IntegrationProviderId) {
  const [row] = await getDb()
    .select()
    .from(integrations)
    .where(and(eq(integrations.brandId, brandId), eq(integrations.provider, provider)))
    .limit(1);
  return row ?? null;
}

async function hasSecret(integrationId: string, secretKey: string) {
  const [row] = await getDb()
    .select({ id: integrationSecrets.id })
    .from(integrationSecrets)
    .where(
      and(
        eq(integrationSecrets.integrationId, integrationId),
        eq(integrationSecrets.secretKey, secretKey),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listIntegrations(brandId: string): Promise<IntegrationView[]> {
  const rows = await getDb()
    .select()
    .from(integrations)
    .where(eq(integrations.brandId, brandId));

  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return Promise.all(
    INTEGRATION_PROVIDERS.map(async (provider) => {
      const row = byProvider.get(provider.id);
      return {
        provider: provider.id,
        name: provider.name,
        description: provider.description,
        enabled: row?.enabled ?? false,
        available: provider.available,
        configurable: provider.configurable,
        config: parseConfig(row?.configJson ?? null),
        hasSecret: row ? await hasSecret(row.id, "api_key") : false,
      };
    }),
  );
}

async function ensureIntegration(scope: BrandScope, provider: IntegrationProviderId) {
  const existing = await getIntegrationRow(scope.brandId, provider);
  if (existing) {
    return existing;
  }

  const [created] = await getDb()
    .insert(integrations)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      provider,
      enabled: false,
    })
    .returning();
  return created;
}

export async function setIntegrationEnabled(
  scope: BrandScope,
  provider: IntegrationProviderId,
  enabled: boolean,
) {
  const integration = await ensureIntegration(scope, provider);
  const [updated] = await getDb()
    .update(integrations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(integrations.id, integration.id))
    .returning();
  return updated;
}

export async function updateIntegrationConfig(
  scope: BrandScope,
  provider: IntegrationProviderId,
  config: IntegrationConfig,
) {
  const integration = await ensureIntegration(scope, provider);
  const [updated] = await getDb()
    .update(integrations)
    .set({
      configJson: JSON.stringify(config),
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, integration.id))
    .returning();
  return updated;
}

export async function saveIntegrationSecret(
  scope: BrandScope,
  provider: IntegrationProviderId,
  secretKey: string,
  secretValue: string,
) {
  const integration = await ensureIntegration(scope, provider);
  const encryptedValue = encryptSecret(secretValue);
  const existing = await getDb()
    .select()
    .from(integrationSecrets)
    .where(
      and(
        eq(integrationSecrets.integrationId, integration.id),
        eq(integrationSecrets.secretKey, secretKey),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await getDb()
      .update(integrationSecrets)
      .set({ encryptedValue, updatedAt: new Date() })
      .where(eq(integrationSecrets.id, existing[0].id));
    return;
  }

  await getDb().insert(integrationSecrets).values({
    integrationId: integration.id,
    secretKey,
    encryptedValue,
  });
}

export async function readIntegrationSecret(
  brandId: string,
  provider: IntegrationProviderId,
  secretKey: string,
) {
  const integration = await getIntegrationRow(brandId, provider);
  if (!integration) {
    return null;
  }

  const [row] = await getDb()
    .select()
    .from(integrationSecrets)
    .where(
      and(
        eq(integrationSecrets.integrationId, integration.id),
        eq(integrationSecrets.secretKey, secretKey),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return decryptSecret(row.encryptedValue);
}
