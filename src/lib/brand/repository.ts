import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  brandProfiles,
  brands,
  competitors,
  type BrandIdentityMemoryPending,
  type BrandProfileMemoryField,
  type BrandProfileMemoryPending,
} from "@/lib/db/schema";
import { MAX_COMPETITORS, type BrandProfileInput, type CompetitorInput } from "@/lib/brand/schemas";
import type { AutonomyMode } from "@/lib/workspace/settings";
import { canEnrollFastAutoPublish, canEnrollNewFullAuto } from "@/lib/agent/safety";

/** A brand always lives inside a workspace; writes need both ids. */
export type BrandScope = { workspaceId: string; brandId: string };

/** Raised when a workspace already has a brand with the same (case-insensitive) name. */
export class BrandExistsError extends Error {
  constructor(name: string) {
    super(`A brand named "${name}" already exists in this workspace.`);
    this.name = "BrandExistsError";
  }
}

/** Raised when a write would push a brand past {@link MAX_COMPETITORS}. */
export class CompetitorLimitError extends Error {
  constructor(message = `A brand can have at most ${MAX_COMPETITORS} competitors.`) {
    super(message);
    this.name = "CompetitorLimitError";
  }
}

function isBrandNameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const details = error as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
  const constraint = details.constraint_name ?? details.constraint;
  return details.code === "23505" && constraint === "brands_workspace_name_unique";
}

async function countCompetitors(brandId: string) {
  const [row] = await getDb()
    .select({ value: count() })
    .from(competitors)
    .where(eq(competitors.brandId, brandId));
  return row?.value ?? 0;
}

export async function listBrands(workspaceId: string) {
  return getDb()
    .select()
    .from(brands)
    .where(eq(brands.workspaceId, workspaceId))
    .orderBy(asc(brands.createdAt));
}

export async function getBrandByName(workspaceId: string, name: string) {
  const trimmed = name.trim();
  const [brand] = await getDb()
    .select()
    .from(brands)
    .where(
      and(eq(brands.workspaceId, workspaceId), sql`lower(${brands.name}) = lower(${trimmed})`),
    )
    .limit(1);
  return brand ?? null;
}

export async function getBrand(workspaceId: string, brandId: string) {
  const [brand] = await getDb()
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)))
    .limit(1);
  return brand ?? null;
}

export async function createBrand(workspaceId: string, name: string, autonomyMode?: AutonomyMode) {
  const trimmed = name.trim();
  if (await getBrandByName(workspaceId, trimmed)) {
    throw new BrandExistsError(trimmed);
  }
  // Preserve the workspace preference as a requested mode, but do not extend
  // FULL_AUTO to a new brand until grounded publishing is certified. Existing
  // brands are untouched by this enrollment freeze.
  const [sibling] = await getDb()
    .select({ autonomyMode: brands.autonomyMode })
    .from(brands)
    .where(eq(brands.workspaceId, workspaceId))
    .orderBy(desc(brands.createdAt))
    .limit(1);
  try {
    const requestedMode = autonomyMode ?? sibling?.autonomyMode ?? "REVIEW";
    const effectiveMode =
      (requestedMode === "FULL_AUTO" && !canEnrollNewFullAuto()) ||
      (requestedMode === "AUTO_PUBLISH_FAST" && !canEnrollFastAutoPublish())
        ? "REVIEW"
        : requestedMode;
    const [brand] = await getDb()
      .insert(brands)
      .values({
        workspaceId,
        name: trimmed,
        autonomyMode: effectiveMode,
      })
      .returning();
    return brand;
  } catch (error) {
    // Two Stripe-return tabs or React Strict Mode remounts can race between the
    // duplicate pre-check and insert. Surface that as the same domain error so
    // the onboarding resume path can complete the existing brand.
    if (isBrandNameUniqueViolation(error)) {
      throw new BrandExistsError(trimmed);
    }
    throw error;
  }
}

export async function renameBrand(workspaceId: string, brandId: string, name: string) {
  return getDb().transaction(async (tx) => {
    const lockKey = `brand-identity-write:${workspaceId}:${brandId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [existing] = await tx
      .select()
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)))
      .limit(1)
      .for("update");
    if (!existing) return null;
    const now = new Date();
    const pending: BrandIdentityMemoryPending = {
      ...existing.memoryProjectionPending,
    };
    if (existing.name !== name) {
      pending.name = {
        value: name.normalize("NFKC").trim().replace(/\s+/g, " "),
        revision: crypto.randomUUID(),
        writtenAt: now.toISOString(),
      };
    }
    const [brand] = await tx
      .update(brands)
      .set({ name, updatedAt: now, memoryProjectionPending: pending })
      .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)))
      .returning();
    return brand ?? null;
  });
}

/** Set a single brand's autonomy mode (auto-publish vs review). */
export async function updateBrandAutonomy(
  workspaceId: string,
  brandId: string,
  autonomyMode: AutonomyMode,
) {
  const [brand] = await getDb()
    .update(brands)
    .set({ autonomyMode, updatedAt: new Date() })
    .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)))
    .returning();
  return brand ?? null;
}

/** Opt a brand's domain in/out of the public score badge (V8.6). */
export async function updateBrandBadgePublic(
  workspaceId: string,
  brandId: string,
  badgePublic: boolean,
) {
  const [brand] = await getDb()
    .update(brands)
    .set({ badgePublic, updatedAt: new Date() })
    .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)))
    .returning();
  return brand ?? null;
}

export async function deleteBrand(workspaceId: string, brandId: string) {
  await getDb()
    .delete(brands)
    .where(and(eq(brands.id, brandId), eq(brands.workspaceId, workspaceId)));
}

export async function getBrandProfile(brandId: string) {
  const [profile] = await getDb()
    .select()
    .from(brandProfiles)
    .where(eq(brandProfiles.brandId, brandId))
    .limit(1);
  return profile ?? null;
}

export async function upsertBrandProfile(scope: BrandScope, input: BrandProfileInput) {
  const db = getDb();
  return db.transaction(async (tx) => {
    // The advisory lock also serializes the no-row-yet case, where FOR UPDATE
    // alone cannot prevent two onboarding/profile requests from racing.
    const lockKey = `brand-profile-write:${scope.workspaceId}:${scope.brandId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [existing] = await tx
      .select()
      .from(brandProfiles)
      .where(
        and(
          eq(brandProfiles.brandId, scope.brandId),
          eq(brandProfiles.workspaceId, scope.workspaceId),
        ),
      )
      .limit(1)
      .for("update");
    const now = new Date();
    const values = {
      productDescription: input.productDescription || null,
      audience: input.audience || null,
      tone: input.tone || null,
      website: input.website || null,
      seedKeywords: input.seedKeywords || null,
      updatedAt: now,
    };
    const fieldValues: Record<BrandProfileMemoryField, string> = {
      product_description: values.productDescription ?? "",
      target_audience: values.audience ?? "",
      tone: values.tone ?? "",
      website: values.website ?? "",
      seed_keywords: values.seedKeywords ?? "",
    };
    const previousValues: Record<BrandProfileMemoryField, string> = {
      product_description: existing?.productDescription ?? "",
      target_audience: existing?.audience ?? "",
      tone: existing?.tone ?? "",
      website: existing?.website ?? "",
      seed_keywords: existing?.seedKeywords ?? "",
    };
    const pending: BrandProfileMemoryPending = {
      ...(existing?.memoryProjectionPending ?? {}),
    };
    for (const [field, value] of Object.entries(fieldValues) as Array<
      [BrandProfileMemoryField, string]
    >) {
      if (!existing || previousValues[field] !== value) {
        pending[field] = {
          value: value.normalize("NFKC").trim().replace(/\s+/g, " "),
          revision: crypto.randomUUID(),
          writtenAt: now.toISOString(),
        };
      }
    }

    if (existing) {
      const [profile] = await tx
        .update(brandProfiles)
        .set({ ...values, memoryProjectionPending: pending })
        .where(
          and(
            eq(brandProfiles.id, existing.id),
            eq(brandProfiles.workspaceId, scope.workspaceId),
          ),
        )
        .returning();
      return profile;
    }

    const [profile] = await tx
      .insert(brandProfiles)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        ...values,
        memoryProjectionPending: pending,
      })
      .returning();
    return profile;
  });
}

export async function listCompetitors(brandId: string) {
  return getDb()
    .select()
    .from(competitors)
    .where(eq(competitors.brandId, brandId))
    .orderBy(asc(competitors.createdAt));
}

export async function createCompetitor(scope: BrandScope, input: CompetitorInput) {
  if ((await countCompetitors(scope.brandId)) >= MAX_COMPETITORS) {
    throw new CompetitorLimitError();
  }
  const [competitor] = await getDb()
    .insert(competitors)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      name: input.name,
      url: input.url,
      rssUrl: input.rssUrl || null,
      sitemapUrl: input.sitemapUrl || null,
    })
    .returning();
  return competitor;
}

/**
 * Insert several competitors at once (the AI-discovery "Add selected" action),
 * clipping to the brand's remaining capacity so the 10-cap always holds.
 */
export async function createCompetitors(scope: BrandScope, inputs: CompetitorInput[]) {
  const remaining = MAX_COMPETITORS - (await countCompetitors(scope.brandId));
  if (remaining <= 0) {
    throw new CompetitorLimitError();
  }
  const toInsert = inputs.slice(0, remaining);
  if (toInsert.length === 0) {
    return [];
  }
  return getDb()
    .insert(competitors)
    .values(
      toInsert.map((input) => ({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        name: input.name,
        url: input.url,
        rssUrl: input.rssUrl || null,
        sitemapUrl: input.sitemapUrl || null,
      })),
    )
    .returning();
}

export async function deleteCompetitor(brandId: string, competitorId: string) {
  await getDb()
    .delete(competitors)
    .where(and(eq(competitors.id, competitorId), eq(competitors.brandId, brandId)));
}
