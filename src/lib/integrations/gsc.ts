import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
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
