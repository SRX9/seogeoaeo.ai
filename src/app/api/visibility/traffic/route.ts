import { asc, eq } from "drizzle-orm";
import { getApiContext, handleApi, HttpError, jsonOk } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { brands } from "@/lib/db/schema/brand";
import { audits, trafficSnapshots } from "@/lib/db/schema/visibility";
import { AI_ENGINES } from "@/lib/visibility/ai-referrers";

/**
 * V6.6 — traffic series for the Proof panel: GSC clicks/impressions/position
 * over time + per-engine AI referrals, plus audit-date markers so score deltas
 * read causally against real traffic. Never metered.
 */
export async function GET() {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const db = getDb();
    const brand = await db.query.brands.findFirst({ where: eq(brands.workspaceId, workspace.id) });
    if (!brand) throw new HttpError(404, "No brand configured for this workspace");

    const snapshots = await db
      .select()
      .from(trafficSnapshots)
      .where(eq(trafficSnapshots.brandId, brand.id))
      .orderBy(asc(trafficSnapshots.date));

    const gsc = snapshots
      .filter((s) => s.source === "gsc")
      .map((s) => ({ date: s.date, clicks: s.clicks ?? 0, impressions: s.impressions ?? 0, position: s.avgPosition }));

    const aiReferrals = snapshots
      .filter((s) => s.source === "ga4")
      .map((s) => ({ date: s.date, byEngine: (s.aiReferrals ?? {}) as Record<string, number> }));

    const auditRows = await db
      .select({ id: audits.id, date: audits.completedAt, overall: audits.overallScore })
      .from(audits)
      .where(eq(audits.workspaceId, workspace.id))
      .orderBy(asc(audits.createdAt));
    const markers = auditRows
      .filter((a) => a.date)
      .map((a) => ({ date: a.date!.toISOString().slice(0, 10), overall: a.overall }));

    return jsonOk({
      connected: { gsc: gsc.length > 0, ga4: aiReferrals.length > 0 },
      engines: AI_ENGINES,
      gsc,
      aiReferrals,
      auditMarkers: markers,
    });
  });
}
