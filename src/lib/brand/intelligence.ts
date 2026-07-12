import { and, asc, eq, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";
import { getDb } from "@/lib/db";
import { brandIntelligence, brandProfiles, brands } from "@/lib/db/schema";
import type {
  BrandAsset,
  BrandColor,
  BrandIdentitySummary,
  BrandIntelligenceData,
} from "@/lib/brand/intelligence-types";
import type { BrandScope } from "@/lib/brand/repository";

export const BRAND_INTELLIGENCE_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const BRAND_INTELLIGENCE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const CONTEXT_BRAND_ENDPOINT = "https://api.context.dev/v1/brand/retrieve";

const nullableString = z.string().trim().min(1).nullable().optional();
const colorSchema = z
  .object({ hex: nullableString, name: nullableString })
  .passthrough();
const assetSchema = z
  .object({
    url: nullableString,
    colors: z.array(colorSchema).nullish(),
    resolution: z
      .object({
        width: z.number().nullable().optional(),
        height: z.number().nullable().optional(),
        aspect_ratio: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

const brandSchema = z
  .object({
    domain: nullableString,
    title: nullableString,
    description: nullableString,
    slogan: nullableString,
    colors: z.array(colorSchema).nullish(),
    logos: z.array(assetSchema).nullish(),
    backdrops: z.array(assetSchema).nullish(),
    socials: z.array(z.object({ url: nullableString }).passthrough()).nullish(),
    address: z.record(z.unknown()).nullable().optional(),
    stock: z.record(z.unknown()).nullable().optional(),
    is_nsfw: z.boolean().nullable().optional(),
    email: nullableString,
    phone: nullableString,
    industries: z.record(z.unknown()).nullable().optional(),
    links: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough();

const responseSchema = z.object({ brand: brandSchema, status: z.string().optional() }).passthrough();

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpsUrl(value: unknown): string | null {
  const text = nonEmptyString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function domainFromWebsite(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const domain = url.hostname.replace(/^www\./i, "").toLowerCase();
    return domain.includes(".") ? domain : null;
  } catch {
    return null;
  }
}

function normalizeColor(input: z.infer<typeof colorSchema>): BrandColor | null {
  const raw = nonEmptyString(input.hex);
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(hex)) return null;
  return { hex: hex.toUpperCase(), name: nonEmptyString(input.name) };
}

function normalizeAsset(input: z.infer<typeof assetSchema>): BrandAsset | null {
  const url = httpsUrl(input.url);
  if (!url) return null;
  const resolution = input.resolution
    ? {
        width: input.resolution.width ?? null,
        height: input.resolution.height ?? null,
        aspectRatio: input.resolution.aspect_ratio ?? null,
      }
    : null;
  return {
    url,
    colors: (input.colors ?? []).flatMap((color) => {
      const normalized = normalizeColor(color);
      return normalized ? [normalized] : [];
    }),
    resolution,
  };
}

function mapStringRecord(value: Record<string, unknown> | null | undefined) {
  return Object.fromEntries(
    Object.entries(value ?? {}).flatMap(([key, item]) => {
      const text = nonEmptyString(item);
      return text ? [[key, text]] : [];
    }),
  );
}

export function normalizeBrandIntelligence(
  input: unknown,
  fallbackDomain: string,
): BrandIntelligenceData {
  const parsed = brandSchema.parse(input);
  const knownKeys = new Set([
    "domain", "title", "description", "slogan", "colors", "logos", "backdrops",
    "socials", "address", "stock", "is_nsfw", "email", "phone", "industries", "links",
  ]);
  const address = parsed.address;
  const stock = parsed.stock;

  return {
    domain: domainFromWebsite(parsed.domain ?? "") ?? fallbackDomain,
    title: nonEmptyString(parsed.title),
    description: nonEmptyString(parsed.description),
    slogan: nonEmptyString(parsed.slogan),
    colors: (parsed.colors ?? []).flatMap((color) => {
      const normalized = normalizeColor(color);
      return normalized ? [normalized] : [];
    }),
    logos: (parsed.logos ?? []).flatMap((asset) => {
      const normalized = normalizeAsset(asset);
      return normalized ? [normalized] : [];
    }),
    backdrops: (parsed.backdrops ?? []).flatMap((asset) => {
      const normalized = normalizeAsset(asset);
      return normalized ? [normalized] : [];
    }),
    socials: (parsed.socials ?? []).flatMap((social) => {
      const url = httpsUrl(social.url);
      return url ? [{ url }] : [];
    }),
    address: address
      ? {
          street: nonEmptyString(address.street),
          city: nonEmptyString(address.city),
          country: nonEmptyString(address.country),
          countryCode: nonEmptyString(address.country_code),
          stateProvince: nonEmptyString(address.state_province),
          stateCode: nonEmptyString(address.state_code),
          postalCode: nonEmptyString(address.postal_code),
        }
      : null,
    stock: stock
      ? { ticker: nonEmptyString(stock.ticker), exchange: nonEmptyString(stock.exchange) }
      : null,
    isNsfw: parsed.is_nsfw ?? null,
    email: nonEmptyString(parsed.email),
    phone: nonEmptyString(parsed.phone),
    industries: parsed.industries ?? null,
    links: mapStringRecord(parsed.links),
    raw: parsed,
    extra: Object.fromEntries(Object.entries(parsed).filter(([key]) => !knownKeys.has(key))),
  };
}

function assetArea(asset: BrandAsset) {
  return (asset.resolution?.width ?? 0) * (asset.resolution?.height ?? 0);
}

export function pickPrimaryLogo(logos: BrandAsset[]): string | null {
  return (
    logos.toSorted((left, right) => {
      const leftRatio = left.resolution?.aspectRatio ?? 1;
      const rightRatio = right.resolution?.aspectRatio ?? 1;
      const ratioScore = (ratio: number) => Math.abs(Math.log(Math.max(ratio, 0.01)));
      return ratioScore(leftRatio) - ratioScore(rightRatio) || assetArea(right) - assetArea(left);
    })[0]?.url ?? null
  );
}

export function pickPrimaryBackdrop(backdrops: BrandAsset[]): string | null {
  return backdrops.toSorted((left, right) => assetArea(right) - assetArea(left))[0]?.url ?? null;
}

export function isBrandIntelligenceConfigured() {
  return Boolean(process.env.CONTEXT_DEV_API_KEY || process.env.CONTEXT_API_KEY);
}

export async function retrieveBrandIntelligence(
  website: string,
  options: { fetchImpl?: typeof fetch; noCache?: boolean } = {},
): Promise<BrandIntelligenceData | null> {
  const domain = domainFromWebsite(website);
  const key = process.env.CONTEXT_DEV_API_KEY || process.env.CONTEXT_API_KEY;
  if (!domain || !key) return null;

  const cacheKey = `brand-intelligence:v1:${domain}`;
  if (!options.noCache) {
    const cached = await kvGetJson<BrandIntelligenceData>(cacheKey);
    if (cached) return cached;
  }

  const response = await (options.fetchImpl ?? fetch)(CONTEXT_BRAND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "by_domain", domain, maxAgeMs: BRAND_INTELLIGENCE_REFRESH_MS }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Context.dev brand lookup failed (${response.status})`);
  }
  const json = responseSchema.parse(await response.json());
  const data = normalizeBrandIntelligence(json.brand, domain);
  if (data.isNsfw === true) {
    throw new Error("Context.dev flagged this brand as unsafe");
  }
  await kvPutJson(cacheKey, data, BRAND_INTELLIGENCE_CACHE_TTL_SECONDS);
  return data;
}

export async function getBrandIntelligence(brandId: string) {
  const [row] = await getDb()
    .select()
    .from(brandIntelligence)
    .where(eq(brandIntelligence.brandId, brandId))
    .limit(1);
  return row ?? null;
}

export async function clearBrandIntelligence(brandId: string) {
  await getDb().delete(brandIntelligence).where(eq(brandIntelligence.brandId, brandId));
}

export function toBrandIdentitySummary(
  row: NonNullable<Awaited<ReturnType<typeof getBrandIntelligence>>>,
): BrandIdentitySummary {
  return {
    title: row.title,
    description: row.description,
    slogan: row.slogan,
    domain: row.domain,
    logoUrl: row.primaryLogoUrl,
    backdropUrl: row.primaryBackdropUrl,
    colors: row.data.colors.slice(0, 8),
    refreshedAt: row.lastRefreshedAt.toISOString(),
    nextRefreshAt: row.nextRefreshAt.toISOString(),
  };
}

export async function getBrandIdentitySummary(brandId: string) {
  const row = await getBrandIntelligence(brandId);
  return row ? toBrandIdentitySummary(row) : null;
}

export async function listBrandIdentitySummaries(workspaceId: string) {
  const rows = await getDb()
    .select()
    .from(brandIntelligence)
    .where(eq(brandIntelligence.workspaceId, workspaceId));
  return new Map(rows.map((row) => [row.brandId, toBrandIdentitySummary(row)]));
}

export async function saveBrandIntelligence(
  scope: BrandScope,
  data: BrandIntelligenceData,
  refreshedAt = new Date(),
) {
  const values = {
    domain: data.domain,
    title: data.title,
    description: data.description,
    slogan: data.slogan,
    primaryLogoUrl: pickPrimaryLogo(data.logos),
    primaryBackdropUrl: pickPrimaryBackdrop(data.backdrops),
    data,
    lastRefreshedAt: refreshedAt,
    nextRefreshAt: new Date(refreshedAt.getTime() + BRAND_INTELLIGENCE_REFRESH_MS),
    updatedAt: refreshedAt,
  };
  const [row] = await getDb()
    .insert(brandIntelligence)
    .values({ ...scope, ...values })
    .onConflictDoUpdate({ target: brandIntelligence.brandId, set: values })
    .returning();
  return row;
}

export async function refreshBrandIntelligence(
  scope: BrandScope,
  website: string,
  options: { force?: boolean; fetchImpl?: typeof fetch } = {},
) {
  const existing = await getBrandIntelligence(scope.brandId);
  if (!options.force && existing && existing.nextRefreshAt > new Date()) return existing;
  const data = await retrieveBrandIntelligence(website, {
    fetchImpl: options.fetchImpl,
    noCache: options.force,
  });
  return data ? saveBrandIntelligence(scope, data) : existing;
}

export async function listDueBrandIntelligence(limit = 25) {
  return getDb()
    .select({
      workspaceId: brands.workspaceId,
      brandId: brands.id,
      website: brandProfiles.website,
    })
    .from(brands)
    .innerJoin(brandProfiles, eq(brandProfiles.brandId, brands.id))
    .leftJoin(brandIntelligence, eq(brandIntelligence.brandId, brands.id))
    .where(
      and(
        or(isNull(brandIntelligence.brandId), lte(brandIntelligence.nextRefreshAt, new Date())),
        // `website` is nullable, but empty/null rows should never consume API credits.
        isNotNull(brandProfiles.website),
        ne(brandProfiles.website, ""),
      ),
    )
    .orderBy(asc(brandIntelligence.nextRefreshAt), asc(brands.createdAt))
    .limit(limit)
    .then((rows) => rows.filter((row) => Boolean(row.website?.trim())));
}
