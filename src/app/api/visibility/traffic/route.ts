import { and, asc, eq } from "drizzle-orm";
import { handleApi, jsonOk, requireApiBrand } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { audits, trafficSnapshots } from "@/lib/db/schema/visibility";
import { listTrafficConnections } from "@/lib/integrations/google-traffic";
import { AI_ENGINES } from "@/lib/visibility/ai-referrers";

/**
 * V6.6: traffic series for the Proof panel: GSC clicks/impressions/position
 * over time + per-engine AI referrals, plus audit-date markers so score deltas
 * read causally against real traffic. Never metered.
 */
export async function GET() {
  return handleApi(async () => {
    // Active brand (cookie-selected), not an arbitrary first brand: multi-brand
    // workspaces must see the proof panel for the brand they're viewing.
    const { workspace, brand } = await requireApiBrand();
    const db = getDb();

    const [snapshots, connections, auditRows] = await Promise.all([
      db
        .select()
        .from(trafficSnapshots)
        .where(eq(trafficSnapshots.brandId, brand.id))
        .orderBy(asc(trafficSnapshots.date)),
      listTrafficConnections(brand.id),
      db
        .select({ id: audits.id, date: audits.completedAt, overall: audits.overallScore })
        .from(audits)
        .where(
          and(
            eq(audits.workspaceId, workspace.id),
            eq(audits.brandId, brand.id),
            eq(audits.kind, "owned"),
          ),
        )
        .orderBy(asc(audits.createdAt)),
    ]);

    const gsc = snapshots
      .filter((s) => s.source === "gsc")
      .map((s) => ({ date: s.date, clicks: s.clicks ?? 0, impressions: s.impressions ?? 0, position: s.avgPosition }));

    const aiReferrals = snapshots
      .filter((s) => s.source === "ga4")
      .map((s) => ({ date: s.date, byEngine: (s.aiReferrals ?? {}) as Record<string, number> }));

    // Owned audits only: a competitor benchmark's score is not a causal marker
    // for the owner's traffic.
    const markers = auditRows
      .filter((a) => a.date)
      .map((a) => ({ date: a.date!.toISOString().slice(0, 10), overall: a.overall }));

    return jsonOk({
      connected: {
        gsc: connections.some((connection) => connection.source === "gsc"),
        ga4: connections.some((connection) => connection.source === "ga4"),
      },
      engines: AI_ENGINES,
      gsc,
      aiReferrals,
      auditMarkers: markers,
    });
  });
}
