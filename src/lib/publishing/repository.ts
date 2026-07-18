import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { articlePublications } from "@/lib/db/schema";
import type { IntegrationProviderId } from "@/lib/integrations/providers";
import type { PublicationStatus } from "@/lib/publishing/types";

export async function listPublicationsForArticle(brandId: string, articleId: string) {
  return getDb()
    .select()
    .from(articlePublications)
    .where(
      and(
        eq(articlePublications.brandId, brandId),
        eq(articlePublications.articleId, articleId),
      ),
    );
}

/** Compact publication state for content-library rows; never returns connector secrets. */
export async function listPublicationSummariesForBrand(brandId: string) {
  return getDb()
    .select({
      articleId: articlePublications.articleId,
      provider: articlePublications.provider,
      status: articlePublications.status,
      externalUrl: articlePublications.externalUrl,
      publishedAt: articlePublications.publishedAt,
      updatedAt: articlePublications.updatedAt,
    })
    .from(articlePublications)
    .where(eq(articlePublications.brandId, brandId))
    .orderBy(
      sql`${articlePublications.publishedAt} desc nulls last`,
      desc(articlePublications.updatedAt),
    )
    .limit(500);
}

/** Canonical remote targets that are known to exist and are safe to recommend. */
export async function listPublishedDestinationsForBrand(brandId: string, limit = 200) {
  return getDb()
    .select({
      articleId: articlePublications.articleId,
      provider: articlePublications.provider,
      externalUrl: articlePublications.externalUrl,
      publishedAt: articlePublications.publishedAt,
    })
    .from(articlePublications)
    .where(
      and(
        eq(articlePublications.brandId, brandId),
        eq(articlePublications.status, "published"),
        isNotNull(articlePublications.externalUrl),
      ),
    )
    .limit(Math.min(500, Math.max(1, limit)));
}

export async function getPublication(
  brandId: string,
  articleId: string,
  provider: IntegrationProviderId,
) {
  const [row] = await getDb()
    .select()
    .from(articlePublications)
    .where(
      and(
        eq(articlePublications.brandId, brandId),
        eq(articlePublications.articleId, articleId),
        eq(articlePublications.provider, provider),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertPublication(
  scope: BrandScope,
  articleId: string,
  provider: IntegrationProviderId,
  input: {
    status: PublicationStatus;
    externalUrl?: string | null;
    externalId?: string | null;
    errorMessage?: string | null;
    attemptCount: number;
    publishedAt?: Date | null;
    publishedHash?: string | null;
  },
) {
  const existing = await getPublication(scope.brandId, articleId, provider);

  if (existing) {
    const [updated] = await getDb()
      .update(articlePublications)
      .set({
        status: input.status,
        externalUrl: input.externalUrl ?? null,
        externalId: input.externalId ?? null,
        errorMessage: input.errorMessage ?? null,
        attemptCount: input.attemptCount,
        publishedAt: input.publishedAt ?? null,
        publishedHash: input.publishedHash ?? null,
        updatedAt: new Date(),
      })
      .where(eq(articlePublications.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await getDb()
    .insert(articlePublications)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      articleId,
      provider,
      status: input.status,
      externalUrl: input.externalUrl ?? null,
      externalId: input.externalId ?? null,
      errorMessage: input.errorMessage ?? null,
      attemptCount: input.attemptCount,
      publishedAt: input.publishedAt ?? null,
      publishedHash: input.publishedHash ?? null,
    })
    .returning();
  return created;
}
