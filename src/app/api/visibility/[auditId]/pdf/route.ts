import { eq } from "drizzle-orm";
import { getApiContext, handleApi, HttpError } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema/visibility";
import { buildReport } from "@/lib/visibility/report";
import { renderReportPdf } from "@/lib/visibility/report-pdf";

/**
 * V6.2 — download the audit report. Returns a PDF when a Browser Rendering
 * binding is available, otherwise a print-ready HTML document.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ auditId: string }> }) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { auditId } = await params;
    const db = getDb();
    const audit = await db.query.audits.findFirst({ where: eq(audits.id, auditId) });
    if (!audit || audit.workspaceId !== workspace.id) throw new HttpError(404, "Audit not found");

    const model = await buildReport(auditId);
    const { body, contentType } = await renderReportPdf(model);
    const ext = contentType.startsWith("application/pdf") ? "pdf" : "html";
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="visibility-report.${ext}"`,
      },
    });
  });
}
