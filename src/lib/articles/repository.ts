import { and, desc, eq, sql } from "drizzle-orm";
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
    .where(eq(topics.brandId, brandId));
  return rows.map((row) => row.title);
}

export async function createResearchTopics(
  scope: BrandScope,
  researchRunId: string,
  items: ScoredTopic[],
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
        }),
        status: "pending",
        source: "research",
      })),
    )
    .returning();
}

/** Remove the topics a (partial, non-completed) research run created, so the run
 * can be safely retried without leaving duplicate pending topics behind. */
export async function deleteResearchTopicsForRun(researchRunId: string) {
  await getDb().delete(topics).where(eq(topics.researchRunId, researchRunId));
}

export async function listPendingTopicsForWriting(brandId: string, limit: number) {
  return getDb()
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.brandId, brandId),
        eq(topics.status, "pending"),
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

export async function listArticles(brandId: string) {
  return getDb()
    .select()
    .from(articles)
    .where(eq(articles.brandId, brandId))
    .orderBy(desc(articles.updatedAt));
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
  },
) {
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
    })
    .returning();
  return article;
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
  },
) {
  const existing = await getArticle(brandId, articleId);
  if (!existing) {
    return null;
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
