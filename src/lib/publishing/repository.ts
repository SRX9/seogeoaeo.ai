import { and, eq } from "drizzle-orm";
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
      errorMessage: input.errorMessage ?? null,
      attemptCount: input.attemptCount,
      publishedAt: input.publishedAt ?? null,
      publishedHash: input.publishedHash ?? null,
    })
    .returning();
  return created;
}
