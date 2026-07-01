import { z } from "zod";
import { INTEGRATION_PROVIDER_IDS } from "@/lib/integrations/providers";

export const brandProfileSchema = z.object({
  productDescription: z.string().max(4000).optional().default(""),
  audience: z.string().max(500).optional().default(""),
  tone: z.string().max(200).optional().default(""),
  website: z.string().url().optional().or(z.literal("")),
  seedKeywords: z.string().max(1000).optional().default(""),
});

/** Hard cap on competitors per brand — enforced in the repository and the UI. */
export const MAX_COMPETITORS = 10;

export const competitorSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  rssUrl: z.string().url().optional().or(z.literal("")),
  sitemapUrl: z.string().url().optional().or(z.literal("")),
});

/** "Add selected" bulk insert from the AI competitor-discovery checklist. */
export const competitorBulkSchema = z.object({
  competitors: z.array(competitorSchema).min(1).max(MAX_COMPETITORS),
});

/** Body for the AI prefill endpoint — runs on the entered name + website, no row yet. */
export const brandPrefillSchema = z.object({
  name: z.string().min(1).max(120),
  website: z.string().url().optional().or(z.literal("")),
});

export const brandNameSchema = z.string().min(1, "Brand name is required").max(120);

export const brandOnboardingSchema = z.object({
  name: brandNameSchema,
  website: z.string().url().optional().or(z.literal("")),
  productDescription: z.string().max(4000).optional().default(""),
  audience: z.string().max(500).optional().default(""),
  tone: z.string().max(200).optional().default(""),
  seedKeywords: z.string().max(1000).optional().default(""),
  competitorName: z.string().max(200).optional().or(z.literal("")),
  competitorUrl: z.string().url().optional().or(z.literal("")),
  integrationProvider: z.enum(INTEGRATION_PROVIDER_IDS).optional().or(z.literal("")),
  integrationConfig: z.record(z.string().max(500)).optional().default({}),
  integrationSecrets: z.record(z.string().max(1000)).optional().default({}),
});

export type BrandProfileInput = z.infer<typeof brandProfileSchema>;
export type CompetitorInput = z.infer<typeof competitorSchema>;
export type CompetitorBulkInput = z.infer<typeof competitorBulkSchema>;
export type BrandPrefillInput = z.infer<typeof brandPrefillSchema>;
export type BrandOnboardingInput = z.infer<typeof brandOnboardingSchema>;
