import { desc, eq } from "drizzle-orm";
import { getApiContext, handleApi, jsonOk } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { weeklyReports } from "@/lib/db/schema/reports";

type ReportBody = {
  proof?: {
    score?: { current?: number | null; baseline?: number | null; delta?: number } | null;
    answerShare?: Array<{ appeared?: number }>;
  };
  fixes?: { applied?: number; verified?: number };
  content?: { published?: unknown[] };
};

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function reportSummary(bodyJson: unknown) {
  const body = (bodyJson ?? {}) as ReportBody;
  const applied = finiteNumber(body.fixes?.applied);
  const verified = finiteNumber(body.fixes?.verified);
  const publishedCount = Array.isArray(body.content?.published) ? body.content.published.length : 0;
  const answerMentions = Array.isArray(body.proof?.answerShare)
    ? body.proof.answerShare.reduce((total, item) => total + finiteNumber(item.appeared), 0)
    : 0;
  const score = body.proof?.score;
  const current = score?.current ?? null;
  const baseline = score?.baseline ?? null;
  const visibilityChangePercent =
    typeof current === "number" && typeof baseline === "number" && baseline > 0
      ? Math.round(((current - baseline) / baseline) * 100)
      : null;

  return {
    completedWork: applied + verified + publishedCount,
    publishedCount,
    answerMentions,
    visibilityScore: typeof current === "number" ? current : null,
    visibilityChangePercent,
  };
}

/**
 * AP5: list the workspace's weekly reports, newest first. Reports are keyed
 * per audited site (brand is attribution only and can be null), so the archive
 * is workspace-scoped rather than brand-scoped.
 */
export async function GET() {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const rows = await getDb()
      .select({
        id: weeklyReports.id,
        weekStart: weeklyReports.weekStart,
        siteUrl: weeklyReports.siteUrl,
        subject: weeklyReports.subject,
        bodyJson: weeklyReports.bodyJson,
        emailedAt: weeklyReports.emailedAt,
        createdAt: weeklyReports.createdAt,
      })
      .from(weeklyReports)
      .where(eq(weeklyReports.workspaceId, workspace.id))
      .orderBy(desc(weeklyReports.weekStart))
      .limit(52);
    return jsonOk({
      reports: rows.map(({ bodyJson, ...report }) => ({
        ...report,
        summary: reportSummary(bodyJson),
      })),
    });
  });
}
