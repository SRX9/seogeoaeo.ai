import { and, eq } from "drizzle-orm";
import { getApiContext, handleApi, HttpError, jsonOk } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { weeklyReports } from "@/lib/db/schema/reports";
import { renderReportLines, type WeeklyReportData } from "@/server/reports/weekly";

/**
 * AP5 — one archived weekly report, re-rendered with the same renderer that
 * produced the email (the archive can never drift from what was sent).
 * Ownership is by workspace — reports are per site and may carry no brand.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { id } = await ctx.params;
    const [row] = await getDb()
      .select()
      .from(weeklyReports)
      .where(and(eq(weeklyReports.id, id), eq(weeklyReports.workspaceId, workspace.id)))
      .limit(1);
    if (!row) throw new HttpError(404, "Report not found");
    const data = row.bodyJson as WeeklyReportData;
    return jsonOk({
      report: {
        id: row.id,
        weekStart: row.weekStart,
        subject: row.subject,
        emailedAt: row.emailedAt,
        createdAt: row.createdAt,
      },
      lines: renderReportLines(data),
      story: {
        proof: data.proof,
        fixes: data.fixes,
        content: data.content,
        planChanges: data.planChanges ?? [],
      },
      ask: data.ask ?? null,
    });
  });
}
