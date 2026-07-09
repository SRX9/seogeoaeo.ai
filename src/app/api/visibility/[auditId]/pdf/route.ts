import { eq } from "drizzle-orm";
import { getApiContext, handleApi, HttpError } from "@/lib/api/server";
import { effectiveVisibilityCaps } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema/visibility";
import { InsufficientCreditsError, spendForVisibilityJob } from "@/lib/usage/credits";
import { buildReport } from "@/lib/visibility/report";
import { renderReportPdf } from "@/lib/visibility/report-pdf";

/**
 * V6.2 — download the audit report. Returns a PDF when a Browser Rendering
 * binding is available, otherwise a print-ready HTML document. Plan-gated
 * (`visibility.pdfReports`) and metered once per audit: the charge's refId is
 * the audit id, so re-downloading the same report is free (ledger idempotency).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ auditId: string }> }) {
  return handleApi(async () => {
    const { workspace, subscription } = await getApiContext();
    const { auditId } = await params;
    const db = getDb();
    const audit = await db.query.audits.findFirst({ where: eq(audits.id, auditId) });
    if (!audit || audit.workspaceId !== workspace.id) throw new HttpError(404, "Audit not found");

    if (!effectiveVisibilityCaps(subscription).pdfReports) {
      throw new HttpError(402, "PDF reports aren't included in your plan.");
    }
    const model = await buildReport(auditId);
    const { body, contentType } = await renderReportPdf(model);
    // Charge only after the render succeeded — failed work never burns credits.
    try {
      await spendForVisibilityJob(workspace.id, "pdf_report", auditId);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) throw new HttpError(402, error.message);
      throw error;
    }
    const ext = contentType.startsWith("application/pdf") ? "pdf" : "html";
    return new Response(body as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="visibility-report.${ext}"`,
      },
    });
  });
}
