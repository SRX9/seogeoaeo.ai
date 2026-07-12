import { eq } from "drizzle-orm";
import { getApiContext, handleApi, HttpError, jsonOk } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema/visibility";
import { buildReport, toMarkdown } from "@/lib/visibility/report";

/** V6.1: report model + Markdown export for one audit. */
export async function GET(_request: Request, { params }: { params: Promise<{ auditId: string }> }) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { auditId } = await params;
    const db = getDb();
    const audit = await db.query.audits.findFirst({ where: eq(audits.id, auditId) });
    if (!audit || audit.workspaceId !== workspace.id) throw new HttpError(404, "Audit not found");

    const model = await buildReport(auditId);
    return jsonOk({ model, markdown: toMarkdown(model) });
  });
}
