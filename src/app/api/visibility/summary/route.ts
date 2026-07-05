import { and, desc, eq } from "drizzle-orm";
import { getApiContext, handleApi, jsonOk } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema/visibility";
import { getIndustryBaseline } from "@/lib/visibility/baseline";
import { scoreBand } from "@/lib/visibility/display";

/**
 * V8.1 — visibility summary: latest audit + its six sub-scores, the previous
 * audit's score (for the delta), and the industry baseline. The hero number is
 * never returned alone.
 */
export async function GET() {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const db = getDb();

    // kind = "owned" — competitor benchmark audits share the workspace but must
    // never surface as the owner's hero score (or its delta baseline).
    const recent = await db
      .select()
      .from(audits)
      .where(
        and(
          eq(audits.workspaceId, workspace.id),
          eq(audits.status, "complete"),
          eq(audits.kind, "owned"),
        ),
      )
      .orderBy(desc(audits.createdAt))
      .limit(2);

    const latest = recent[0] ?? null;
    const previous = recent[1] ?? null;
    const baseline = latest ? await getIndustryBaseline(latest.businessType) : { baseline: null, sample: 0, scope: "none" as const };

    return jsonOk({
      hasAudit: !!latest,
      latest: latest && {
        id: latest.id,
        overall: latest.overallScore,
        band: latest.overallScore != null ? scoreBand(latest.overallScore) : null,
        aiVisibility: latest.aiVisibilityScore,
        businessType: latest.businessType,
        completedAt: latest.completedAt,
        subScores: {
          citability: latest.citabilityScore,
          brand: latest.brandScore,
          eeat: latest.eeatScore,
          technical: latest.technicalScore,
          schema: latest.schemaScore,
          platform: latest.platformScore,
        },
      },
      previousOverall: previous?.overallScore ?? null,
      baseline,
    });
  });
}
