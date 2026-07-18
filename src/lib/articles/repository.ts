import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { articles, topics } from "@/lib/db/schema";
import { slugify } from "@/lib/articles/format";
import type { ScoredTopic } from "@/lib/research/types";

export async function listTopics(brandId: string) {
  return getDb()
    .select()
    .from(topics)
    .where(eq(topics.brandId, brandId))
    .orderBy(
      sql`CASE WHEN ${topics.score} IS NULL THEN 0 ELSE 1 END DESC`,
      desc(topics.score),
      desc(topics.createdAt),
    );
}

export async function listTopicTitles(brandId: string) {
  const rows = await getDb()
    .select({ title: topics.title })
    .from(topics)
    .where(
      and(
        eq(topics.brandId, brandId),
        // A memory correction can invalidate research-derived queue entries.
        // Excluding them lets the next corrected research pass rediscover a
        // still-valid title instead of treating stale planning work as a dedupe hit.
        sql`${topics.status} <> 'invalidated'`,
      ),
    );
  return rows.map((row) => row.title);
}

export async function createResearchTopics(
  scope: BrandScope,
  researchRunId: string,
  items: ScoredTopic[],
  options: { memoryEvidenceRefs?: readonly string[] } = {},
) {
  if (items.length === 0) {
    return [];
  }

  return getDb()
    .insert(topics)
    .values(
      items.map((item) => ({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        researchRunId,
        title: item.title,
        angle: item.angle ?? null,
        keywords: item.keywords ?? null,
        score: item.score,
        rationale: item.rationale,
        answerFit: item.answerFit,
        evidenceJson: JSON.stringify({
          source: item.source,
          sourceType: item.sourceType,
          evidenceUrls: item.evidenceUrls,
          query: item.query,
          memoryEvidenceRefs: [...new Set(options.memoryEvidenceRefs ?? [])],
        }),
        status: "pending",
        source: "research",
        intentTier: item.intentTier ?? null,
        thesis: item.thesis ?? null,
      })),
    )
    .returning();
}

/** Remove only queued artifacts from a partial research run. In-flight and
 * completed topics are immutable history and may already own an article. */
export async function deleteResearchTopicsForRun(
  scope: BrandScope,
  researchRunId: string,
) {
  await getDb()
    .delete(topics)
    .where(
      and(
        eq(topics.workspaceId, scope.workspaceId),
        eq(topics.brandId, scope.brandId),
        eq(topics.researchRunId, researchRunId),
        eq(topics.source, "research"),
        inArray(topics.status, ["pending", "failed", "invalidated"]),
      ),
    );
}

export async function listPendingTopicsForWriting(brandId: string, limit: number) {
  // Include retriable failed topics (transient LLM errors) so the daily agent
  // doesn't permanently drop them. Stuck "generating" rows older than 2h are
  // healed by the planner separately when needed.
  return getDb()
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.brandId, brandId),
        sql`${topics.status} IN ('pending', 'failed')`,
        sql`${topics.score} IS NOT NULL`,
      ),
    )
    .orderBy(desc(topics.score), desc(topics.createdAt))
    .limit(limit);
}

export async function listManualPendingTopics(brandId: string) {
  return getDb()
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.brandId, brandId),
        eq(topics.status, "pending"),
        eq(topics.source, "manual"),
      ),
    )
    .orderBy(desc(topics.createdAt));
}

export async function getTopic(brandId: string, topicId: string) {
  const [topic] = await getDb()
    .select()
    .from(topics)
    .where(and(eq(topics.brandId, brandId), eq(topics.id, topicId)))
    .limit(1);
  return topic ?? null;
}

export async function createTopic(
  scope: BrandScope,
  input: { title: string; angle?: string; keywords?: string },
) {
  const [topic] = await getDb()
    .insert(topics)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      title: input.title,
      angle: input.angle || null,
      keywords: input.keywords || null,
      status: "pending",
      source: "manual",
    })
    .returning();
  return topic;
}

export async function updateTopicStatus(topicId: string, status: string) {
  await getDb()
    .update(topics)
    .set({ status, updatedAt: new Date() })
    .where(eq(topics.id, topicId));
}

/**
 * List articles for the brand **without** `bodyMarkdown` (payload is large).
 * Includes `bodyLength` so UIs can gate approve/publish without a full GET.
 * Use `getArticle` for the editor body.
 */
export async function listArticles(brandId: string) {
  return getDb()
    .select({
      id: articles.id,
      workspaceId: articles.workspaceId,
      brandId: articles.brandId,
      topicId: articles.topicId,
      title: articles.title,
      slug: articles.slug,
      metaDescription: articles.metaDescription,
      tags: articles.tags,
      status: articles.status,
      version: articles.version,
      shape: articles.shape,
      gateResultsJson: articles.gateResultsJson,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
      bodyLength: sql<number>`char_length(${articles.bodyMarkdown})`.mapWith(Number),
    })
    .from(articles)
    .where(eq(articles.brandId, brandId))
    .orderBy(desc(articles.updatedAt));
}

/** Atomically refuse stale, invalidated, completed, or concurrently claimed work. */
export async function claimTopicForGeneration(scope: BrandScope, topicId: string) {
  const [topic] = await getDb()
    .update(topics)
    .set({ status: "generating", updatedAt: new Date() })
    .where(
      and(
        eq(topics.id, topicId),
        eq(topics.workspaceId, scope.workspaceId),
        eq(topics.brandId, scope.brandId),
        sql`${topics.status} IN ('pending', 'failed')`,
      ),
    )
    .returning();
  return topic ?? null;
}

/**
 * The bounded brand corpus used by the Phase 3 originality and internal-link
 * evaluators. This is server-only and intentionally separate from listArticles,
 * which keeps large bodies out of normal UI list responses.
 */
export async function listArticleGroundingCorpus(
  brandId: string,
  options: number | { query?: string; limit?: number } = 100,
) {
  const limit = typeof options === "number" ? options : options.limit ?? 100;
  const query = typeof options === "number" ? "" : options.query?.trim() ?? "";
  const stopTerms = new Set([
    "and", "are", "for", "from", "has", "have", "how", "into", "its", "that", "the",
    "their", "this", "was", "were", "what", "when", "where", "which", "with", "your",
  ]);
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])]
    .filter((term) => term.length >= 3 && !stopTerms.has(term))
    .slice(0, 40);
  const search = terms.join(" OR ");
  const searchVector = sql`to_tsvector('english', coalesce(${articles.title}, '') || ' ' || coalesce(${articles.tags}, '') || ' ' || coalesce(${articles.bodyMarkdown}, ''))`;
  const brandPredicate = search
    ? and(
        eq(articles.brandId, brandId),
        sql`${searchVector} @@ websearch_to_tsquery('english', ${search})`,
      )
    : eq(articles.brandId, brandId);
  const relevanceOrder = search
    ? sql`ts_rank_cd(${searchVector}, websearch_to_tsquery('english', ${search})) desc`
    : desc(articles.updatedAt);
  return getDb()
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      metaDescription: articles.metaDescription,
      tags: articles.tags,
      bodyMarkdown: articles.bodyMarkdown,
      status: articles.status,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(brandPredicate)
    .orderBy(relevanceOrder, desc(articles.updatedAt))
    .limit(Math.min(200, Math.max(1, limit)));
}

export async function getArticle(brandId: string, articleId: string) {
  const [article] = await getDb()
    .select()
    .from(articles)
    .where(and(eq(articles.brandId, brandId), eq(articles.id, articleId)))
    .limit(1);
  return article ?? null;
}

export async function createArticle(
  scope: BrandScope,
  input: {
    topicId?: string;
    title: string;
    slug: string;
    metaDescription?: string;
    tags: string[];
    bodyMarkdown: string;
    status?: string;
    shape?: string;
    gateResultsJson?: string;
    memoryEvidenceRefs?: readonly string[];
  },
) {
  const memoryEvidenceRefs = [...new Set(input.memoryEvidenceRefs ?? [])];
  if (
    memoryEvidenceRefs.length > 32 ||
    memoryEvidenceRefs.some(
      (ref) =>
        !/^memory:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          ref,
        ),
    )
  ) {
    throw new Error("Generated article memory evidence is invalid");
  }
  const [article] = await getDb()
    .insert(articles)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      topicId: input.topicId ?? null,
      title: input.title,
      slug: input.slug || slugify(input.title),
      metaDescription: input.metaDescription ?? null,
      tags: JSON.stringify(input.tags),
      bodyMarkdown: input.bodyMarkdown,
      status: input.status ?? "draft",
      version: 1,
      shape: input.shape ?? null,
      gateResultsJson: input.gateResultsJson ?? null,
      memoryEvidenceRefs,
      memoryEvidenceVersion: memoryEvidenceRefs.length > 0 ? 1 : null,
    })
    .returning();
  return article;
}

/**
 * Finalize the initial generated draft after its claim ledger and publication
 * gate have been stored. The content itself did not change, so this does not
 * create a new article version.
 */
export async function setGeneratedArticleStatus(
  brandId: string,
  articleId: string,
  status: "draft" | "approved",
  gateResultsJson?: string,
) {
  const [article] = await getDb()
    .update(articles)
    .set({
      status,
      ...(gateResultsJson === undefined ? {} : { gateResultsJson }),
      updatedAt: new Date(),
    })
    .where(and(eq(articles.brandId, brandId), eq(articles.id, articleId)))
    .returning();
  return article ?? null;
}

export async function updateArticle(
  brandId: string,
  articleId: string,
  input: {
    title: string;
    slug: string;
    metaDescription?: string;
    tags: string[];
    bodyMarkdown: string;
    status: string;
    /** When set, rejects the update if the stored version differs (optimistic lock). */
    expectedVersion?: number;
  },
) {
  const existing = await getArticle(brandId, articleId);
  if (!existing) {
    return null;
  }
  if (input.expectedVersion != null && existing.version !== input.expectedVersion) {
    const err = new Error("VERSION_CONFLICT") as Error & { current: typeof existing };
    err.current = existing;
    throw err;
  }

  const [article] = await getDb()
    .update(articles)
    .set({
      title: input.title,
      slug: input.slug || slugify(input.title),
      metaDescription: input.metaDescription ?? null,
      tags: JSON.stringify(input.tags),
      bodyMarkdown: input.bodyMarkdown,
      status: input.status,
      version: existing.version + 1,
      // Status transitions and owner edits do not silently waive generated
      // evidence. A later correction must still stop publication of this line.
      memoryEvidenceRefs: existing.memoryEvidenceRefs,
      memoryEvidenceVersion:
        existing.memoryEvidenceRefs.length > 0 ? existing.version + 1 : null,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId))
    .returning();
  return article;
}

export async function getArticleByTopic(brandId: string, topicId: string) {
  const [article] = await getDb()
    .select()
    .from(articles)
    .where(and(eq(articles.brandId, brandId), eq(articles.topicId, topicId)))
    .orderBy(desc(articles.createdAt))
    .limit(1);
  return article ?? null;
}
