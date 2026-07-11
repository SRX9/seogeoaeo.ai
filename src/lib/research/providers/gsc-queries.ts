import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { searchQueries } from "@/lib/db/schema/content";
import type { ResearchContext, ResearchFinding, ResearchProvider } from "@/lib/research/types";
import { persistNewFindings } from "@/lib/visibility/findings-repository";
import type { Finding } from "@/lib/visibility/types";

/**
 * C2: GSC query mining. Deterministic (no LLM): three plays over the brand's
 * own Search Console query×page report (synced weekly into `search_queries`).
 *
 * 1. Striking distance: queries at position 8-25 with real impressions become
 *    topics: Google already believes we're relevant; one dedicated piece moves
 *    us to page 1.
 * 2. CTR gap: page-1 rankings clicking far below the expected curve become
 *    title/meta rewrite *fixes* (into the shared fix queue), not topics.
 * 3. Query families: clusters of related queries with impressions spread
 *    across pages but no dedicated page become one cluster-head topic.
 *
 * Not connected → the provider quietly contributes nothing.
 */

export interface SearchQueryRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number | null;
}

/** Every threshold in one place (the C2 doc's "one config object" rule). */
export const GSC_MINING = {
  /** 28-day impression floor below which a query is noise. */
  minImpressions: 50,
  strikingDistance: { minPosition: 8, maxPosition: 25 },
  ctrGap: {
    maxPosition: 10,
    /** Expected CTR by rounded position 1-10 (industry curve, conservative). */
    expectedCtrByPosition: [0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.03, 0.028, 0.025],
    /** Flag when actual CTR is below this fraction of expected. */
    gapRatio: 0.5,
  },
  family: { minQueries: 3, minImpressions: 100, minSpreadPages: 2 },
  /** Cap so GSC plays inform the backlog without monopolizing a research run. */
  maxTopicsPerRun: 8,
} as const;

export type GscMiningConfig = typeof GSC_MINING;

const BOFU_PATTERNS = [/\bbest\b/, /\bvs\.?\b/, /\balternatives?\b/, /\bpricing\b/, /\breviews?\b/, /\btop \d+/];
const STOP_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "for", "with", "and", "or", "is", "are", "my", "your", "how", "what", "why", "do", "does", "can"]);

function titleCase(query: string): string {
  return query.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function inferIntent(query: string): "bofu" | "mofu" {
  return BOFU_PATTERNS.some((p) => p.test(query)) ? "bofu" : "mofu";
}

/** Play 1: striking distance: position 8-25, real impressions → topic findings. */
export function mineStrikingDistance(
  rows: SearchQueryRow[],
  cfg: GscMiningConfig = GSC_MINING,
): ResearchFinding[] {
  return rows
    .filter(
      (r) =>
        r.position != null &&
        r.position >= cfg.strikingDistance.minPosition &&
        r.position <= cfg.strikingDistance.maxPosition &&
        r.impressions >= cfg.minImpressions,
    )
    .sort((a, b) => b.impressions - a.impressions)
    .map((r) => ({
      title: titleCase(r.query),
      query: r.query,
      source: "gsc",
      sourceType: "gsc_query" as const,
      evidenceUrls: [r.page],
      intentTier: inferIntent(r.query),
      thesis: `Google shows you at #${Math.round(r.position ?? 0)} for "${r.query}": ${r.impressions} impressions/mo waiting on page 2.`,
    }));
}

/** Expected CTR at a (rounded) page-1 position. */
function expectedCtr(position: number, cfg: GscMiningConfig): number {
  const idx = Math.min(Math.max(Math.round(position), 1), 10) - 1;
  return cfg.ctrGap.expectedCtrByPosition[idx] ?? 0.025;
}

/**
 * Play 2: CTR gap: ranking page 1 but clicked at under half the expected rate.
 * The page doesn't need new content; it needs a better shop window. Emitted as
 * fix-queue findings with a deterministic title/description rewrite payload
 * (`meta_tags`: the artifact builder and AP4 dispatch handle it unchanged).
 */
export function mineCtrGaps(
  rows: SearchQueryRow[],
  brand: { name?: string | null; productDescription?: string | null },
  cfg: GscMiningConfig = GSC_MINING,
): Finding[] {
  return rows
    .filter((r) => {
      if (r.position == null || r.position > cfg.ctrGap.maxPosition) return false;
      if (r.impressions < cfg.minImpressions) return false;
      const ctr = r.clicks / Math.max(r.impressions, 1);
      return ctr < expectedCtr(r.position, cfg) * cfg.ctrGap.gapRatio;
    })
    .sort((a, b) => b.impressions - a.impressions)
    .map((r) => {
      const suffix = brand.name ? `: ${brand.name}` : "";
      const title = `${titleCase(r.query)}${suffix}`.slice(0, 60);
      const blurb = (brand.productDescription ?? "").split(/[.!?]/)[0]?.trim();
      const description = `${titleCase(r.query)}: ${blurb || "a clear, direct answer"}: see how it works.`.slice(0, 155);
      return {
        pillar: "seo" as const,
        category: "search_ctr",
        severity: "medium" as const,
        title: `Page 1 for "${r.query}" but barely clicked`,
        recommendation: `You rank #${Math.round(r.position ?? 0)} for "${r.query}" (${r.impressions} impressions/mo) but earn far fewer clicks than that position should. Rewrite the page's title and description so the listing answers the query at a glance.`,
        fix_capability: "auto" as const,
        fix_payload: {
          kind: "meta_tags",
          url: r.page,
          suggested: { title, description },
        },
      };
    });
}

export interface QueryFamily {
  head: string;
  queries: SearchQueryRow[];
  impressions: number;
  pages: string[];
}

/**
 * The canonical query-family key (normalized, stop-word-stripped, stemmed head
 * bigram). Exported so C4's performance loop buckets follow-ups and dead
 * families with the SAME key C2 clustered topics under: a divergent copy
 * would penalize the wrong families.
 */
export function familyHead(query: string): string {
  const tokens = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((t) => t && !STOP_WORDS.has(t))
    // Light plural stemming so "invoices" and "invoice" share a family.
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
  return tokens.slice(0, 2).join(" ");
}

/** Deterministic clustering: group by shared head bigram (normalized + stemmed). */
export function clusterQueryFamilies(
  rows: SearchQueryRow[],
  cfg: GscMiningConfig = GSC_MINING,
): QueryFamily[] {
  const byHead = new Map<string, SearchQueryRow[]>();
  for (const row of rows) {
    const head = familyHead(row.query);
    if (!head) continue;
    const bucket = byHead.get(head) ?? [];
    bucket.push(row);
    byHead.set(head, bucket);
  }
  const families: QueryFamily[] = [];
  for (const [head, queries] of byHead) {
    if (queries.length < cfg.family.minQueries) continue;
    const impressions = queries.reduce((sum, q) => sum + q.impressions, 0);
    if (impressions < cfg.family.minImpressions) continue;
    families.push({ head, queries, impressions, pages: [...new Set(queries.map((q) => q.page))] });
  }
  return families.sort((a, b) => b.impressions - a.impressions);
}

/**
 * Play 3: family gaps: impressions spread across ≥2 pages with no single
 * dominant page means Google can't find one canonical answer from us: a
 * dedicated cluster-head piece consolidates the demand.
 */
export function mineFamilyGaps(
  families: QueryFamily[],
  cfg: GscMiningConfig = GSC_MINING,
): ResearchFinding[] {
  return families
    .filter((family) => {
      if (family.pages.length < cfg.family.minSpreadPages) return false;
      // A page already owning >60% of the family's impressions is its home.
      const byPage = new Map<string, number>();
      for (const q of family.queries) {
        byPage.set(q.page, (byPage.get(q.page) ?? 0) + q.impressions);
      }
      const top = Math.max(...byPage.values());
      return top / Math.max(family.impressions, 1) <= 0.6;
    })
    .map((family) => {
      const best = [...family.queries].sort((a, b) => b.impressions - a.impressions)[0];
      return {
        title: titleCase(best.query),
        query: best.query,
        source: "gsc",
        sourceType: "gsc_query" as const,
        evidenceUrls: family.pages.slice(0, 3),
        intentTier: inferIntent(best.query),
        thesis: `You're picking up ${family.impressions} impressions/mo across ${family.queries.length} "${family.head}" queries with no dedicated page.`,
      };
    });
}

/**
 * Latest-period rows for a brand. `search_queries` retains ~13 weekly periods
 * (QUERY_KEEP_PERIODS, for C4 trend reads), so the period filter is load-bearing:
 * without it every query is counted once per retained period and impression
 * sums inflate ~13×. Shared with the C4 performance loop.
 */
export async function loadLatestQueryRows(brandId: string): Promise<SearchQueryRow[]> {
  const db = getDb();
  const [latest] = await db
    .select({ periodStart: searchQueries.periodStart })
    .from(searchQueries)
    .where(eq(searchQueries.brandId, brandId))
    .orderBy(desc(searchQueries.periodStart))
    .limit(1);
  if (!latest) return [];
  return db
    .select({
      query: searchQueries.query,
      page: searchQueries.page,
      clicks: searchQueries.clicks,
      impressions: searchQueries.impressions,
      position: searchQueries.position,
    })
    .from(searchQueries)
    .where(
      and(
        eq(searchQueries.brandId, brandId),
        eq(searchQueries.periodStart, latest.periodStart),
      ),
    );
}

export const gscQueriesProvider: ResearchProvider = {
  id: "gsc_queries",
  isAvailable: () => true,
  async discover(context: ResearchContext): Promise<ResearchFinding[]> {
    const scope = context.scope;
    if (!scope) return [];
    const rows = await loadLatestQueryRows(scope.brandId);
    if (rows.length === 0) return [];

    // CTR-gap fixes go straight to the shared fix queue (dedup lives in the
    // repository). Best-effort: a findings-write failure must never sink the
    // research run: the topic plays below still count.
    try {
      const fixes = mineCtrGaps(rows, context.brand);
      if (fixes.length > 0) await persistNewFindings(scope.workspaceId, fixes);
    } catch (error) {
      console.error("[gsc-queries] persisting CTR-gap fixes failed", error);
    }

    const striking = mineStrikingDistance(rows);
    const familyGaps = mineFamilyGaps(clusterQueryFamilies(rows));
    // Striking-distance first: the highest-probability wins: then family
    // heads that aren't already covered by a striking-distance pick.
    const seen = new Set(striking.map((f) => f.title.toLowerCase()));
    const merged = [
      ...striking,
      ...familyGaps.filter((f) => !seen.has(f.title.toLowerCase())),
    ];
    return merged.slice(0, GSC_MINING.maxTopicsPerRun);
  },
};
