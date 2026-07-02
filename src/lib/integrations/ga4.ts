import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { trafficSnapshots } from "@/lib/db/schema/visibility";
import { aggregateAiReferrals } from "@/lib/visibility/ai-referrers";

/**
 * V6.6 — GA4 AI-referral pull. OAuth token from the integration-secret framework.
 * Runs a Data API report of sessions by date × source, keeps only AI surfaces
 * (via the shared referrer list), and stores per-engine counts per date in
 * traffic_snapshots (source "ga4"). Optional and never metered.
 */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export interface Ga4Row {
  date: string;
  referrer: string;
  sessions: number;
}

/** Query the GA4 Data API for daily sessions by source. */
export async function fetchGa4Sessions(
  propertyId: string,
  accessToken: string,
  days = 90,
  fetchImpl: typeof fetch = fetch,
): Promise<Ga4Row[]> {
  const res = await fetchImpl(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: isoDaysAgo(days), endDate: isoDaysAgo(1) }],
        dimensions: [{ name: "date" }, { name: "sessionSource" }],
        metrics: [{ name: "sessions" }],
        limit: 10_000,
      }),
    },
  );
  if (!res.ok) throw new Error(`GA4 report failed (${res.status})`);
  const data = (await res.json()) as {
    rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  };
  return (data.rows ?? []).map((r) => ({
    // GA4 date dimension is YYYYMMDD → normalize to ISO.
    date: r.dimensionValues[0].value.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"),
    referrer: r.dimensionValues[1].value,
    sessions: Number(r.metricValues[0].value) || 0,
  }));
}

/** Pull + upsert per-date AI-referral counts. Returns the number of dates stored. */
export async function syncGa4(
  brandId: string,
  propertyId: string,
  accessToken: string,
  opts: { days?: number; fetchImpl?: typeof fetch } = {},
): Promise<number> {
  const rows = await fetchGa4Sessions(propertyId, accessToken, opts.days ?? 90, opts.fetchImpl ?? fetch);
  const byDate = new Map<string, { referrer: string; sessions: number }[]>();
  for (const r of rows) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);

  const values = [...byDate.entries()]
    .map(([date, dayRows]) => ({ brandId, source: "ga4", date, aiReferrals: aggregateAiReferrals(dayRows) }))
    .filter((v) => Object.keys(v.aiReferrals).length > 0);
  if (values.length === 0) return 0;

  const db = getDb();
  await db
    .insert(trafficSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [trafficSnapshots.brandId, trafficSnapshots.source, trafficSnapshots.date],
      set: { aiReferrals: sql`excluded.ai_referrals` },
    });
  return values.length;
}
