import { desc, eq } from "drizzle-orm";
import { getApiContext, handleApi, jsonOk } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { weeklyReports } from "@/lib/db/schema/reports";

/**
 * AP5 — list the workspace's weekly reports, newest first. Reports are keyed
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
        emailedAt: weeklyReports.emailedAt,
        createdAt: weeklyReports.createdAt,
      })
      .from(weeklyReports)
      .where(eq(weeklyReports.workspaceId, workspace.id))
      .orderBy(desc(weeklyReports.weekStart))
      .limit(52);
    return jsonOk({ reports: rows });
  });
}
