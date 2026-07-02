import { eq } from "drizzle-orm";
import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";
import { InsufficientCreditsError, spendForVisibilityJob } from "@/lib/usage/credits";
import { createAudit, deleteAudit, executeAudit } from "@/server/visibility/run-audit";

const startAuditSchema = z.object({
  url: z
    .string()
    .min(1)
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.string().url()),
});

/** Kick off an audit; the run continues in the background. Returns `auditId`. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const { url } = parseBody(startAuditSchema, await readJson(request));

    const auditId = await createAudit(workspace.id, url);
    // Meter before work starts; refId = auditId keeps retries idempotent.
    try {
      await spendForVisibilityJob(workspace.id, "visibility_audit", auditId);
    } catch (error) {
      // The run never starts, so drop the orphaned "running" row before bailing.
      await deleteAudit(auditId);
      if (error instanceof InsufficientCreditsError) {
        throw new HttpError(402, error.message);
      }
      throw error;
    }
    const run = executeAudit(auditId, url).catch((error) => {
      console.error("[visibility] audit execution failed", error);
    });

    const ctx = getCloudflareRequestContext()?.ctx as
      | { waitUntil?: (promise: Promise<unknown>) => void }
      | undefined;
    if (ctx?.waitUntil) {
      ctx.waitUntil(run);
    }

    return jsonOk({ auditId }, { status: 202 });
  });
}

/** Audit status + result: `GET /api/visibility/audit?id=<auditId>`. */
export async function GET(request: Request) {
  return handleApi(async () => {
    const { workspace } = await getApiContext();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      throw new HttpError(400, "Missing ?id");
    }

    const db = getDb();
    const audit = await db.query.audits.findFirst({
      where: (table, { and, eq: eqOp }) =>
        and(eqOp(table.id, id), eqOp(table.workspaceId, workspace.id)),
    });
    if (!audit) {
      throw new HttpError(404, "Audit not found");
    }
    const findings = await db.select().from(auditFindings).where(eq(auditFindings.auditId, id));

    return jsonOk({ audit, findings });
  });
}
