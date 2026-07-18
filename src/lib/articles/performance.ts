import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  articles,
  performanceCheckpoints,
  topics,
  topicSourceWeights,
} from "@/lib/db/schema/content";
import { articlePublications } from "@/lib/db/schema/publications";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import {
  familyHead,
  loadLatestQueryRows,
  type SearchQueryRow,
} from "@/lib/research/providers/gsc-queries";
import { persistNewFindings } from "@/lib/visibility/findings-repository";
import type { Finding } from "@/lib/visibility/types";
import { recordPerformanceCheckpointAttribution } from "@/lib/agent/learning";

export type { SearchQueryRow };

/**
 * C4: the performance loop. Published articles are read at day 7 / 28 / 90
 * against the brand's own Search Console query report (C2's `search_queries`),
 * given a verdict, and the verdict acts: winners spawn follow-up topics in the
 * same query family, stallers get a title/meta rescue in the fix queue, dead
 * families get deprioritized: and monthly, each topic *source* earns a scoring
 * weight from its track record. Deterministic throughout (no LLM).
 */

export const CHECKPOINT_DAYS = [7, 28, 90] as const;
export type CheckpointDay = (typeof CHECKPOINT_DAYS)[number];

export type Verdict = "winner" | "stalling" | "dead" | "watching";

/** Verdict thresholds in one place. */
export const PERFORMANCE = {
  /** Page-1 position that makes a checkpoint a winner outright. */
  winnerPosition: 10,
  /** Minimum impressions for any confident verdict. */
  minImpressions: 30,
  /** Growth vs the prior checkpoint that also counts as winning. */
  winnerGrowthRatio: 1.5,
  /** Day-90 impressions below this = dead. */
  deadImpressions: 20,
  /** The striking-distance band where a piece is "stalling", not growing. */
  stallBand: { min: 8, max: 25 },
  /** Follow-up topics queued per winner. */
  followUpsPerWinner: 2,
  /** Score given to follow-up topics (winners' families jump the queue). */
  followUpScore: 75,
  /** Dead families: pending topic scores are multiplied down by this. */
  deadFamilyPenalty: 0.5,
  /** Source weights are bounded here and shrink toward 1 on small samples. */
  weight: { min: 0.5, max: 2, fullConfidenceSample: 10 },
  /** How often source weights re-learn. */
  weightRefreshDays: 30,
} as const;

export interface PageMetrics {
  impressions: number;
  clicks: number;
  position: number | null;
}

/** Normalize scheme/host-case/trailing-slash so GSC pages match stored URLs. */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  }
}

export function pageMatches(externalUrl: string, gscPage: string): boolean {
  return normalizeUrl(externalUrl) === normalizeUrl(gscPage);
}

/** The queries an article was written to win, from its topic. */
export function targetQueriesForTopic(topic: {
  keywords?: string | null;
  evidenceJson?: string | null;
}): string[] {
  const out = new Set<string>();
  if (topic.evidenceJson) {
    try {
      const evidence = JSON.parse(topic.evidenceJson) as { query?: string };
      if (evidence.query) out.add(evidence.query.toLowerCase());
    } catch {
      // ignore malformed evidence
    }
  }
  for (const k of (topic.keywords ?? "").split(",")) {
    const trimmed = k.trim().toLowerCase();
    if (trimmed) out.add(trimmed);
  }
  return [...out];
}

/**
 * Aggregate the report rows that belong to this article: its page's rows plus
 * rows for its target queries (Google sometimes routes a target query to
 * another page: that still tells us how the family is doing). Position is the
 * impression-weighted average of the page's own rows.
 */
export function readPageMetrics(
  rows: SearchQueryRow[],
  externalUrl: string,
  targetQueries: string[],
): PageMetrics {
  const targets = new Set(targetQueries.map((q) => q.toLowerCase()));
  const mine = rows.filter(
    (r) => pageMatches(externalUrl, r.page) || targets.has(r.query.toLowerCase()),
  );
  const pageRows = mine.filter((r) => pageMatches(externalUrl, r.page));
  const impressions = mine.reduce((sum, r) => sum + r.impressions, 0);
  const clicks = mine.reduce((sum, r) => sum + r.clicks, 0);
  const weighted = pageRows.filter((r) => r.position != null && r.impressions > 0);
  const weightSum = weighted.reduce((sum, r) => sum + r.impressions, 0);
  const position =
    weightSum > 0
      ? weighted.reduce((sum, r) => sum + (r.position ?? 0) * r.impressions, 0) / weightSum
      : null;
  return { impressions, clicks, position };
}

/**
 * The verdict rules (pure):
 * - watching: no GSC data (null metrics), or too little signal before day 90;
 * - winner  : page 1, or impressions growing ≥1.5× vs the prior checkpoint;
 * - stalling: real impressions but stuck at 8-25, or page-1 with a weak CTR;
 * - dead    : day 90 only, with negligible impressions.
 */
export function verdictFor(
  day: CheckpointDay,
  metrics: PageMetrics | null,
  prior: Array<{ day: number; impressions: number }> = [],
): Verdict {
  if (!metrics) return "watching";
  const { impressions, clicks, position } = metrics;

  if (day === 90 && impressions < PERFORMANCE.deadImpressions) return "dead";
  if (impressions < PERFORMANCE.minImpressions) return "watching";

  if (position != null && position <= PERFORMANCE.winnerPosition) {
    // Page 1 but barely clicked is a shop-window problem, not a win.
    const ctr = clicks / Math.max(impressions, 1);
    if (ctr < 0.01) return "stalling";
    return "winner";
  }

  const previous = [...prior].sort((a, b) => b.day - a.day)[0];
  if (previous && previous.impressions > 0) {
    if (impressions >= previous.impressions * PERFORMANCE.winnerGrowthRatio) return "winner";
  }

  if (
    position != null &&
    position >= PERFORMANCE.stallBand.min &&
    position <= PERFORMANCE.stallBand.max
  ) {
    return "stalling";
  }
  return "watching";
}

/** Bounded 0.5-2.0 source weight from a win rate, shrunk toward 1 on small samples. */
export function boundedWeight(winRate: number, sample: number): number {
  const confidence = Math.min(sample / PERFORMANCE.weight.fullConfidenceSample, 1);
  // winRate 0.5 is neutral; map [0,1] → [min,max] around 1, then shrink.
  const raw = winRate >= 0.5
    ? 1 + (winRate - 0.5) * 2 * (PERFORMANCE.weight.max - 1)
    : 1 - (0.5 - winRate) * 2 * (1 - PERFORMANCE.weight.min);
  const shrunk = 1 + (raw - 1) * confidence;
  return Math.min(PERFORMANCE.weight.max, Math.max(PERFORMANCE.weight.min, shrunk));
}

// ---- The runner ------------------------------------------------------------

type DueArticle = {
  articleId: string;
  title: string;
  externalUrl: string;
  publishedAt: Date;
  topicId: string | null;
};

/** Published articles whose age crossed a checkpoint day with no row yet. */
async function listDueCheckpoints(
  brandId: string,
  now: Date,
): Promise<Array<{ article: DueArticle; day: CheckpointDay }>> {
  const db = getDb();
  // Earliest successful publication per article = the clock's start.
  const published = await db
    .select({
      articleId: articlePublications.articleId,
      title: articles.title,
      topicId: articles.topicId,
      externalUrl: articlePublications.externalUrl,
      publishedAt: articlePublications.publishedAt,
    })
    .from(articlePublications)
    .innerJoin(articles, eq(articles.id, articlePublications.articleId))
    .where(
      and(
        eq(articlePublications.brandId, brandId),
        eq(articlePublications.status, "published"),
        isNotNull(articlePublications.externalUrl),
        isNotNull(articlePublications.publishedAt),
      ),
    );

  const byArticle = new Map<string, DueArticle>();
  for (const p of published) {
    if (!p.externalUrl || !p.publishedAt) continue;
    const existing = byArticle.get(p.articleId);
    if (!existing || p.publishedAt < existing.publishedAt) {
      byArticle.set(p.articleId, {
        articleId: p.articleId,
        title: p.title,
        externalUrl: p.externalUrl,
        publishedAt: p.publishedAt,
        topicId: p.topicId,
      });
    }
  }
  if (byArticle.size === 0) return [];

  const existing = await db
    .select({ articleId: performanceCheckpoints.articleId, day: performanceCheckpoints.day })
    .from(performanceCheckpoints)
    .where(inArray(performanceCheckpoints.articleId, [...byArticle.keys()]));
  const have = new Set(existing.map((c) => `${c.articleId}:${c.day}`));

  const due: Array<{ article: DueArticle; day: CheckpointDay }> = [];
  for (const article of byArticle.values()) {
    const ageDays = (now.getTime() - article.publishedAt.getTime()) / 86_400_000;
    for (const day of CHECKPOINT_DAYS) {
      if (ageDays >= day && !have.has(`${article.articleId}:${day}`)) {
        due.push({ article, day });
        break; // one checkpoint per article per run: oldest missing day first
      }
    }
  }
  return due;
}

/**
 * Winner → queue follow-up topics from the family's uncovered queries.
 * `existingTitles` is the brand's lowercased topic-title set, fetched once per
 * run by the caller (and updated here as inserts land): not re-scanned per
 * winner. Family bucketing uses C2's shared `familyHead`.
 */
async function queueFollowUps(
  scope: BrandScope,
  article: DueArticle,
  targetQueries: string[],
  rows: SearchQueryRow[],
  existingTitles: Set<string>,
): Promise<string[]> {
  const db = getDb();
  const targets = new Set(targetQueries.map((q) => q.toLowerCase()));
  const primary = targetQueries[0] ?? article.title;
  const head = familyHead(primary);
  if (!head) return [];

  const candidates = rows
    .filter((r) => familyHead(r.query) === head && !targets.has(r.query.toLowerCase()))
    .sort((a, b) => b.impressions - a.impressions);

  const picks: string[] = [];
  const inserted: string[] = [];
  for (const c of candidates) {
    if (picks.length >= PERFORMANCE.followUpsPerWinner) break;
    const title = c.query.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
    if (existingTitles.has(title.toLowerCase()) || picks.includes(title.toLowerCase())) continue;
    picks.push(title.toLowerCase());
    existingTitles.add(title.toLowerCase());
    const [row] = await db
      .insert(topics)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        title,
        keywords: c.query,
        score: PERFORMANCE.followUpScore,
        rationale: `Follow-up to "${article.title}", which is winning its query family.`,
        answerFit: "Extends a proven winner: interlink both pieces.",
        evidenceJson: JSON.stringify({
          source: "gsc",
          sourceType: "gsc_query",
          evidenceUrls: [c.page],
          query: c.query,
        }),
        status: "pending",
        source: "performance_followup",
        intentTier: "mofu",
        thesis: `"${article.title}" reached page 1. The related query "${c.query}" gets ${c.impressions} impressions each month and has no dedicated article yet.`,
      })
      .returning({ id: topics.id });
    if (row) inserted.push(row.id);
  }
  return inserted;
}

/** Stalling → a title/meta rescue in the shared fix queue (AP4 dispatches it). */
async function queueStallFix(
  scope: BrandScope,
  article: DueArticle,
  metrics: PageMetrics,
  primaryQuery: string | null,
): Promise<number> {
  const query = primaryQuery ?? article.title;
  const finding: Finding = {
    pillar: "seo",
    category: "search_ctr",
    severity: "medium",
    title: `"${article.title}" is stalling in search`,
    recommendation: `The piece sits at position ${metrics.position != null ? Math.round(metrics.position) : "Not available"} with ${metrics.impressions} impressions/mo but isn't converting them to clicks. Refresh the title and meta description around "${query}", and tighten the opening answer block: don't rewrite the article.`,
    fix_capability: "auto",
    fix_payload: {
      kind: "meta_tags",
      url: article.externalUrl,
      suggested: {
        title: `${query.replace(/\b[a-z]/g, (ch) => ch.toUpperCase())}: answered`.slice(0, 60),
        description:
          `${article.title}: the direct answer, with steps and examples. Updated for ${new Date().getFullYear()}.`.slice(
            0,
            155,
          ),
      },
    },
  };
  return persistNewFindings(scope.workspaceId, [finding]);
}

/** Dead → deprioritize the family's pending topics; learning lands in weights. */
async function deprioritizeFamily(scope: BrandScope, primaryQuery: string | null): Promise<number> {
  if (!primaryQuery) return 0;
  const head = familyHead(primaryQuery);
  if (!head) return 0;
  const db = getDb();
  const pending = await db
    .select({ id: topics.id, title: topics.title, score: topics.score, rationale: topics.rationale })
    .from(topics)
    .where(and(eq(topics.brandId, scope.brandId), eq(topics.status, "pending")));
  const family = pending.filter((t) => familyHead(t.title) === head && t.score != null);
  for (const t of family) {
    await db
      .update(topics)
      .set({
        score: Math.round((t.score ?? 0) * PERFORMANCE.deadFamilyPenalty),
        rationale: `${t.rationale ?? ""} This topic family moved down the queue after 90 days without traction.`.trim(),
        updatedAt: new Date(),
      })
      .where(eq(topics.id, t.id));
  }
  return family.length;
}

export interface CheckpointRunResult {
  checked: number;
  byVerdict: Record<Verdict, number>;
}

/**
 * The daily checkpoint runner (called from `settleDailyForBrand`, best-effort).
 * Idempotent: the unique (article, day) index means a re-run inserts nothing,
 * and actions only fire when this run created the checkpoint row.
 */
export async function runDueCheckpoints(
  scope: BrandScope,
  now: Date = new Date(),
): Promise<CheckpointRunResult> {
  const result: CheckpointRunResult = {
    checked: 0,
    byVerdict: { winner: 0, stalling: 0, dead: 0, watching: 0 },
  };
  const due = await listDueCheckpoints(scope.brandId, now);
  if (due.length === 0) return result;

  const db = getDb();
  // Latest period only: the table retains ~13 weekly periods for trend reads,
  // and summing them would inflate every metric by the period count (turning
  // dead articles into "winners" as history accumulates).
  const rows = await loadLatestQueryRows(scope.brandId);
  const hasGscData = rows.length > 0;

  const topicIds = due.map((d) => d.article.topicId).filter((id): id is string => Boolean(id));
  const [topicRows, priorRows] = await Promise.all([
    topicIds.length
      ? db
          .select({ id: topics.id, keywords: topics.keywords, evidenceJson: topics.evidenceJson })
          .from(topics)
          .where(inArray(topics.id, topicIds))
      : Promise.resolve([]),
    // All due articles' prior checkpoints in one query, not one per article.
    db
      .select({
        articleId: performanceCheckpoints.articleId,
        day: performanceCheckpoints.day,
        impressions: performanceCheckpoints.impressions,
      })
      .from(performanceCheckpoints)
      .where(
        inArray(
          performanceCheckpoints.articleId,
          due.map((d) => d.article.articleId),
        ),
      ),
  ]);
  const topicById = new Map(topicRows.map((t) => [t.id, t]));
  const priorByArticle = new Map<string, Array<{ day: number; impressions: number }>>();
  for (const p of priorRows) {
    const list = priorByArticle.get(p.articleId) ?? [];
    list.push({ day: p.day, impressions: p.impressions ?? 0 });
    priorByArticle.set(p.articleId, list);
  }
  // The brand's topic titles, fetched once on the first winner (queueFollowUps
  // dedupes against and appends to this set).
  let knownTitles: Set<string> | null = null;

  for (const { article, day } of due) {
    const topic = article.topicId ? topicById.get(article.topicId) : undefined;
    const targetQueries = topic ? targetQueriesForTopic(topic) : [];
    const metrics = hasGscData
      ? readPageMetrics(rows, article.externalUrl, targetQueries)
      : null;

    const verdict = verdictFor(day, metrics, priorByArticle.get(article.articleId) ?? []);

    // Insert first; act only if we won the insert (idempotency under retries).
    const insertedRows = await db
      .insert(performanceCheckpoints)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        articleId: article.articleId,
        day,
        impressions: metrics?.impressions ?? null,
        clicks: metrics?.clicks ?? null,
        position: metrics?.position ?? null,
        verdict,
      })
      .onConflictDoNothing({
        target: [performanceCheckpoints.articleId, performanceCheckpoints.day],
      })
      .returning({ id: performanceCheckpoints.id });
    const checkpoint = insertedRows[0];
    if (!checkpoint) continue;

    result.checked += 1;
    result.byVerdict[verdict] += 1;

    try {
      await recordPerformanceCheckpointAttribution(scope, checkpoint.id, now);
    } catch (error) {
      // Attribution is idempotent and the bounded learning refresh can recover
      // it later; never discard the durable checkpoint itself.
      console.error(
        `[performance] outcome attribution failed for checkpoint ${checkpoint.id}`,
        error,
      );
    }

    // Dispatch the verdict's action, best-effort, and record it on the row.
    try {
      const primaryQuery = targetQueries[0] ?? null;
      let actions: Record<string, unknown> | null = null;
      if (verdict === "winner" && metrics) {
        knownTitles ??= new Set(
          (
            await db
              .select({ title: topics.title })
              .from(topics)
              .where(eq(topics.brandId, scope.brandId))
          ).map((t) => t.title.toLowerCase()),
        );
        const followUps = await queueFollowUps(scope, article, targetQueries, rows, knownTitles);
        if (followUps.length > 0) actions = { followUpTopicIds: followUps };
      } else if (verdict === "stalling" && metrics) {
        const findings = await queueStallFix(scope, article, metrics, primaryQuery);
        actions = { stallFixFindings: findings };
      } else if (verdict === "dead") {
        const deprioritized = await deprioritizeFamily(scope, primaryQuery);
        if (deprioritized > 0) actions = { deprioritizedTopics: deprioritized };
      }
      if (actions) {
        await db
          .update(performanceCheckpoints)
          .set({ actionsJson: JSON.stringify(actions) })
          .where(eq(performanceCheckpoints.id, checkpoint.id));
      }
    } catch (error) {
      console.error(`[performance] verdict action failed for article ${article.articleId}`, error);
    }
  }

  // One activity row per brand-day of checkpoints (skip empty days).
  if (result.checked > 0) {
    try {
      const job = await createAgentJob(scope, "performance_check");
      const v = result.byVerdict;
      await finishAgentJob(
        job.id,
        "completed",
        `Checked ${result.checked} published article(s): ${v.winner} winning, ${v.stalling} stalling, ${v.dead} dead.`,
        { ...result },
      );
    } catch (error) {
      console.error("[performance] activity log failed", error);
    }
  }
  return result;
}

// ---- Source-level learning ---------------------------------------------------

const VERDICT_VALUE: Record<Verdict, number | null> = {
  winner: 1,
  stalling: 0.5,
  dead: 0,
  watching: null, // no signal: excluded
};

/** Re-learn per-source weights from checkpoint outcomes (bounded, monthly). */
export async function updateSourceWeights(brandId: string): Promise<Record<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      verdict: performanceCheckpoints.verdict,
      evidenceJson: topics.evidenceJson,
      topicSource: topics.source,
    })
    .from(performanceCheckpoints)
    .innerJoin(articles, eq(articles.id, performanceCheckpoints.articleId))
    .innerJoin(topics, eq(topics.id, articles.topicId))
    .where(eq(performanceCheckpoints.brandId, brandId));

  const bySource = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const value = VERDICT_VALUE[(row.verdict ?? "watching") as Verdict];
    if (value == null) continue;
    let source = row.topicSource;
    try {
      const evidence = JSON.parse(row.evidenceJson ?? "{}") as { sourceType?: string };
      if (evidence.sourceType) source = evidence.sourceType;
    } catch {
      // fall back to the topic's own source column
    }
    const agg = bySource.get(source) ?? { sum: 0, n: 0 };
    agg.sum += value;
    agg.n += 1;
    bySource.set(source, agg);
  }

  const weights: Record<string, number> = {};
  for (const [source, { sum, n }] of bySource) {
    const weight = boundedWeight(sum / n, n);
    weights[source] = weight;
    await db
      .insert(topicSourceWeights)
      .values({ brandId, source, weight, sample: n })
      .onConflictDoUpdate({
        target: [topicSourceWeights.brandId, topicSourceWeights.source],
        set: { weight, sample: n, updatedAt: new Date() },
      });
  }
  return weights;
}

/**
 * Current learned weights for a brand (empty when nothing learned yet).
 * Never throws: weights only ever *inform* scoring and list decoration, so a
 * read failure degrades to "nothing learned": but it's logged here, once,
 * instead of being silently `.catch(() => ({}))`-ed at every call site.
 */
export async function getSourceWeights(brandId: string): Promise<Record<string, number>> {
  try {
    const rows = await getDb()
      .select({ source: topicSourceWeights.source, weight: topicSourceWeights.weight })
      .from(topicSourceWeights)
      .where(eq(topicSourceWeights.brandId, brandId));
    return Object.fromEntries(rows.map((r) => [r.source, r.weight]));
  } catch (error) {
    console.error(`[performance] reading source weights failed for brand ${brandId}`, error);
    return {};
  }
}

/** Monthly guard for the daily job: re-learn only when weights are stale. */
export async function maybeUpdateSourceWeights(scope: BrandScope): Promise<boolean> {
  const db = getDb();
  const [latest] = await db
    .select({ updatedAt: sql<Date>`max(${topicSourceWeights.updatedAt})` })
    .from(topicSourceWeights)
    .where(eq(topicSourceWeights.brandId, scope.brandId));
  const staleAfter = Date.now() - PERFORMANCE.weightRefreshDays * 86_400_000;
  if (latest?.updatedAt && new Date(latest.updatedAt).getTime() > staleAfter) return false;
  // Nothing to learn from → skip quietly (also covers brands with no checkpoints).
  const [any] = await db
    .select({ id: performanceCheckpoints.id })
    .from(performanceCheckpoints)
    .where(eq(performanceCheckpoints.brandId, scope.brandId))
    .limit(1);
  if (!any) return false;
  await updateSourceWeights(scope.brandId);
  return true;
}

/**
 * Latest checkpoint per article, for the articles list UI. Never throws.
 * verdict chips are decoration, so a read failure degrades to "no verdicts"
 * (logged here rather than swallowed per call site).
 */
export async function latestVerdicts(
  brandId: string,
): Promise<Record<string, { verdict: Verdict; day: number; position: number | null }>> {
  try {
    const rows = await getDb()
      .select({
        articleId: performanceCheckpoints.articleId,
        day: performanceCheckpoints.day,
        verdict: performanceCheckpoints.verdict,
        position: performanceCheckpoints.position,
      })
      .from(performanceCheckpoints)
      .where(eq(performanceCheckpoints.brandId, brandId))
      .orderBy(desc(performanceCheckpoints.day));
    const out: Record<string, { verdict: Verdict; day: number; position: number | null }> = {};
    for (const row of rows) {
      if (!out[row.articleId] && row.verdict) {
        out[row.articleId] = {
          verdict: row.verdict as Verdict,
          day: row.day,
          position: row.position,
        };
      }
    }
    return out;
  } catch (error) {
    console.error(`[performance] reading verdicts failed for brand ${brandId}`, error);
    return {};
  }
}
