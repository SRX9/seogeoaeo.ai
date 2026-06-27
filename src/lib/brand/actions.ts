"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBillingContext } from "@/lib/billing/access";
import { requireBrand, setActiveBrandCookie } from "@/lib/brand/context";
import {
  createBrand,
  createCompetitor,
  deleteBrand,
  deleteCompetitor,
  getBrand,
  listBrands,
  renameBrand,
  upsertBrandProfile,
} from "@/lib/brand/repository";
import { brandOnboardingSchema, brandProfileSchema, competitorSchema } from "@/lib/brand/schemas";
import {
  saveIntegrationSecret,
  setIntegrationEnabled,
} from "@/lib/integrations/repository";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

export async function saveBrandProfileAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const parsed = brandProfileSchema.safeParse({
    productDescription: formData.get("productDescription"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    website: formData.get("website"),
    seedKeywords: formData.get("seedKeywords"),
  });

  if (!parsed.success) {
    return;
  }

  await upsertBrandProfile(scope, parsed.data);
  revalidatePath("/settings");
}

export async function addCompetitorAction(formData: FormData): Promise<void> {
  const { scope } = await requireBrand();
  const parsed = competitorSchema.safeParse({
    name: formData.get("name"),
    url: formData.get("url"),
    rssUrl: formData.get("rssUrl"),
    sitemapUrl: formData.get("sitemapUrl"),
  });

  if (!parsed.success) {
    return;
  }

  await createCompetitor(scope, parsed.data);
  revalidatePath("/settings");
}

export async function removeCompetitorAction(competitorId: string): Promise<void> {
  const { brand } = await requireBrand();
  await deleteCompetitor(brand.id, competitorId);
  revalidatePath("/settings");
}

export async function switchBrandAction(brandId: string): Promise<void> {
  const { workspace } = await getBillingContext();
  const brand = await getBrand(workspace.id, brandId);
  if (!brand) {
    return;
  }
  await setActiveBrandCookie(brand.id);
  revalidatePath("/", "layout");
}

export async function renameBrandAction(formData: FormData): Promise<void> {
  const { workspace } = await requireBrand();
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!brandId || !name) {
    return;
  }
  await renameBrand(workspace.id, brandId, name);
  revalidatePath("/", "layout");
}

export async function deleteBrandAction(brandId: string): Promise<void> {
  const { workspace } = await requireBrand();
  const remaining = await listBrands(workspace.id);
  // Never delete the last brand — the workspace must always have one.
  if (remaining.length <= 1) {
    return;
  }
  await deleteBrand(workspace.id, brandId);
  const next = remaining.find((brand) => brand.id !== brandId);
  if (next) {
    await setActiveBrandCookie(next.id);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Multi-step "register a brand" submission. Creates the brand, its profile, an
 * optional first competitor, and an optional publishing integration, then makes
 * the new brand active.
 */
export async function createBrandAction(formData: FormData): Promise<void> {
  const { workspace } = await getBillingContext();

  const parsed = brandOnboardingSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website"),
    productDescription: formData.get("productDescription"),
    audience: formData.get("audience"),
    tone: formData.get("tone"),
    seedKeywords: formData.get("seedKeywords"),
    competitorName: formData.get("competitorName"),
    competitorUrl: formData.get("competitorUrl"),
    integrationProvider: formData.get("integrationProvider"),
    integrationApiKey: formData.get("integrationApiKey"),
  });

  if (!parsed.success) {
    return;
  }

  const data = parsed.data;
  const brand = await createBrand(workspace.id, data.name);
  const scope = { workspaceId: workspace.id, brandId: brand.id };

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
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
