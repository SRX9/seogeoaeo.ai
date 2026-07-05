import { eq } from "drizzle-orm";
import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { getCloudflareRequestContext } from "@/lib/cloudflare/context";
import { getDb } from "@/lib/db";
import { auditFindings } from "@/lib/db/schema/visibility";
import {
  assertVisibilityCredits,
  InsufficientCreditsError,
  spendForVisibilityJob,
} from "@/lib/usage/credits";
import { getBrandProfile } from "@/lib/brand/repository";
import { createAudit, executeAudit } from "@/server/visibility/run-audit";

const urlSchema = z
  .string()
  .min(1)
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .pipe(z.string().url());

// Zero-input rule: the brand's website is the default target. `url` stays as an
// explicit override for Toolbox / multi-property cases only.
const startAuditSchema = z.object({ url: urlSchema.optional() });

/** Kick off an audit of the active brand's site; the run continues in the background. Returns `auditId`. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace, brand } = await requireApiBrand();
    const { url: override } = parseBody(startAuditSchema, await readJson(request));
    const website = override ?? (await getBrandProfile(brand.id))?.website;
    const url = website ? parseBody(urlSchema, website) : null;
    if (!url) {
      throw new HttpError(400, "This brand has no website yet — add one in brand settings.", {
        code: "NO_WEBSITE",
      });
    }

    // Pre-check balance (402) without charging; a failed audit must never burn
    // credits, so the actual spend happens after the run succeeds.
    try {
      await assertVisibilityCredits(workspace.id, "visibility_audit");
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new HttpError(402, error.message);
      }
      throw error;
    }

    const auditId = await createAudit(workspace.id, url);
    // Charge only on success; refId = auditId keeps retries idempotent.
    const run = executeAudit(auditId, url)
      .then((ok) => (ok ? spendForVisibilityJob(workspace.id, "visibility_audit", auditId) : undefined))
      .catch((error) => {
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
