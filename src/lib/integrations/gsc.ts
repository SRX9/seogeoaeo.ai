import { and, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { searchQueries } from "@/lib/db/schema/content";
import { trafficSnapshots } from "@/lib/db/schema/visibility";

/**
 * V6.6 — Google Search Console daily pull. OAuth token comes from the existing
 * encrypted integration-secret framework (the caller passes a valid access
 * token). Writes site-level daily clicks/impressions/position into
 * traffic_snapshots, idempotent per (brand, source, date). Proof is never metered.
 */

export interface GscDailyRow {
  date: string;
  clicks: number;
  impressions: number;
  position: number;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Query the Search Analytics API for daily site-level rows. */
export async function fetchGscDaily(
  siteUrl: string,
  accessToken: string,
  days = 90,
  fetchImpl: typeof fetch = fetch,
): Promise<GscDailyRow[]> {
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: isoDaysAgo(days), endDate: isoDaysAgo(1), dimensions: ["date"], rowLimit: days }),
  });
  if (!res.ok) throw new Error(`GSC query failed (${res.status})`);
  const data = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; position: number }[];
  };
  return (data.rows ?? [])
    .map((r) => ({
      date: r.keys?.[0] ?? "",
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      position: r.position ?? 0,
    }))
    .filter((row) => row.date);
}

// ---- C2: the query × page report that feeds topic mining + performance loops --

export interface GscQueryRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  /** Null when the API omits it — NOT 0, which downstream would read as rank #1. */
  position: number | null;
}

/** How many days one query report covers (a stable, seasonal-noise-resistant window). */
export const QUERY_WINDOW_DAYS = 28;
/** Top rows by impressions — one API call, plenty for every mining play. */
const QUERY_ROW_LIMIT = 1000;
/** Refresh cadence for the query report (it "rides the weekly research run"). */
const QUERY_STALE_DAYS = 7;
/** Keep this many past periods so C4 checkpoints can read trend lines. */
const QUERY_KEEP_PERIODS = 13;

/** Query the Search Analytics API with query+page dimensions (28-day window). */
export async function fetchGscQueries(
  siteUrl: string,
  accessToken: string,
  opts: { days?: number; rowLimit?: number; fetchImpl?: typeof fetch } = {},
): Promise<GscQueryRow[]> {
  const days = opts.days ?? QUERY_WINDOW_DAYS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      startDate: isoDaysAgo(days),
      endDate: isoDaysAgo(1),
      dimensions: ["query", "page"],
      rowLimit: opts.rowLimit ?? QUERY_ROW_LIMIT,
    }),
  });
  if (!res.ok) throw new Error(`GSC query report failed (${res.status})`);
  const data = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; position: number }[];
  };
  return (data.rows ?? [])
    .map((r) => ({
      query: r.keys?.[0] ?? "",
      page: r.keys?.[1] ?? "",
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      // A missing position stays null: 0 would read as "ranking #1" in the
      // CTR-gap play and mint bogus auto-applied meta rewrites.
      position: r.position ?? null,
    }))
    .filter((row) => row.query && row.page);
}

/** Is the brand's stored query report older than the weekly refresh window? */
export async function isQueryDataStale(brandId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ latest: max(searchQueries.periodEnd) })
    .from(searchQueries)
    .where(eq(searchQueries.brandId, brandId));
  if (!row?.latest) return true;
  return row.latest < isoDaysAgo(QUERY_STALE_DAYS);
}

/**
 * Pull + store the query×page report for the current period. Replace-by-period:
 * the period's rows are deleted and re-inserted (the unique index backstops a
 * race), and periods older than {@link QUERY_KEEP_PERIODS} windows are pruned so
 * the table stays ~1k rows per brand per period. Returns rows stored.
 */
export async function syncGscQueries(
  brandId: string,
  siteUrl: string,
  accessToken: string,
  opts: { days?: number; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const days = opts.days ?? QUERY_WINDOW_DAYS;
  const rows = await fetchGscQueries(siteUrl, accessToken, { days, fetchImpl: opts.fetchImpl });
  if (rows.length === 0) return 0;
  const periodStart = isoDaysAgo(days);
  const periodEnd = isoDaysAgo(1);
  const db = getDb();
  await db
    .delete(searchQueries)
    .where(and(eq(searchQueries.brandId, brandId), eq(searchQueries.periodStart, periodStart)));
  await db.insert(searchQueries).values(
    rows.map((r) => ({
      brandId,
      query: r.query,
      page: r.page,
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
      periodStart,
      periodEnd,
    })),
  );
  // Prune history beyond what C4 trend reads need.
  const keepAfter = isoDaysAgo(QUERY_KEEP_PERIODS * QUERY_STALE_DAYS + days);
  await db
    .delete(searchQueries)
    .where(and(eq(searchQueries.brandId, brandId), sql`${searchQueries.periodEnd} < ${keepAfter}`));
  return rows.length;
}

/** Pull + upsert GSC daily rows. Returns the number of days stored. */
export async function syncGsc(
  brandId: string,
  siteUrl: string,
  accessToken: string,
  opts: { days?: number; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const rows = await fetchGscDaily(siteUrl, accessToken, opts.days ?? 90, opts.fetchImpl ?? fetch);
  if (rows.length === 0) return 0;
  const db = getDb();
  await db
    .insert(trafficSnapshots)
    .values(rows.map((r) => ({ brandId, source: "gsc", date: r.date, clicks: r.clicks, impressions: r.impressions, avgPosition: r.position })))
    .onConflictDoUpdate({
      target: [trafficSnapshots.brandId, trafficSnapshots.source, trafficSnapshots.date],
      set: {
        clicks: sql`excluded.clicks`,
        impressions: sql`excluded.impressions`,
        avgPosition: sql`excluded.avg_position`,
      },
    });
  return rows.length;
}
