"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBrand } from "@/lib/brand/context";
import type { BrandScope } from "@/lib/brand/repository";
import {
  saveIntegrationSecret,
  setIntegrationEnabled,
  updateIntegrationConfig,
} from "@/lib/integrations/repository";
import type { IntegrationProviderId } from "@/lib/integrations/providers";

const toggleProviderSchema = z.enum([
  "markdown_export",
  "webhook",
  "devto",
  "hashnode",
  "wordpress",
  "ghost",
]);

export async function toggleIntegrationAction(
  provider: IntegrationProviderId,
  enabled: boolean,
): Promise<void> {
  const parsedProvider = toggleProviderSchema.safeParse(provider);
  if (!parsedProvider.success) {
    return;
  }

  const { scope } = await requireBrand();
  await setIntegrationEnabled(scope, parsedProvider.data, enabled);
  revalidatePath("/settings");
}

async function saveApiKeyIntegration(
  scope: BrandScope,
  provider: IntegrationProviderId,
  apiKey: string,
) {
  if (apiKey) {
    await saveIntegrationSecret(scope, provider, "api_key", apiKey);
  }
}

export async function saveWebhookIntegrationAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (webhookUrl) {
    try {
      new URL(webhookUrl);
    } catch {
      return;
    }
  }

  await updateIntegrationConfig(scope, "webhook", { webhookUrl });
  await saveApiKeyIntegration(scope, "webhook", apiKey);
  revalidatePath("/settings");
}

export async function saveDevtoIntegrationAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  await saveApiKeyIntegration(scope, "devto", apiKey);
  revalidatePath("/settings");
}

export async function saveHashnodeIntegrationAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const publicationId = String(formData.get("publicationId") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  await updateIntegrationConfig(scope, "hashnode", { publicationId });
  await saveApiKeyIntegration(scope, "hashnode", apiKey);
  revalidatePath("/settings");
}

export async function saveWordpressIntegrationAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const siteUrl = String(formData.get("siteUrl") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (siteUrl) {
    try {
      new URL(siteUrl);
    } catch {
      return;
    }
  }

  await updateIntegrationConfig(scope, "wordpress", { siteUrl, username });
  await saveApiKeyIntegration(scope, "wordpress", apiKey);
  revalidatePath("/settings");
}

export async function saveGhostIntegrationAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const adminApiUrl = String(formData.get("adminApiUrl") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  if (adminApiUrl) {
    try {
      new URL(adminApiUrl);
    } catch {
      return;
    }
  }

  await updateIntegrationConfig(scope, "ghost", { adminApiUrl });
  await saveApiKeyIntegration(scope, "ghost", apiKey);
  revalidatePath("/settings");
}
