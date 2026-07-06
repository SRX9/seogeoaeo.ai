import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getApiContext, handleApi, HttpError, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { getDb } from "@/lib/db";
import { auditFindings, audits } from "@/lib/db/schema/visibility";
import { assertVisibilityCredits, InsufficientCreditsError } from "@/lib/usage/credits";
import { getBrandProfile } from "@/lib/brand/repository";
import { triggerManualAudit } from "@/server/visibility/manual-audit";
import { createAudit } from "@/server/visibility/run-audit";

/**
 * Past this age a `running` audit is considered dead: the Workflow's execute
 * step tops out well under this (15-min timeout × 3 retries with backoff), so
 * anything older was killed without persisting. GET marks it failed so the UI
 * shows a retry instead of an eternal spinner. A false positive (instance
 * still queued past the hour) self-corrects: executeAudit's settling update is
 * unconditional, so the row flips back to its true outcome when it runs.
 * Monitor/setup rows nobody polls are settled by `settleStaleAudits` daily.
 */
const STALE_AUDIT_MS = 60 * 60 * 1000;

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
    // Durable execution (AuditRunWorkflow): survives isolate eviction, charges
    // credits only on success. Falls back to waitUntil outside Cloudflare.
    await triggerManualAudit(workspace.id, auditId, url);

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
      where: and(eq(audits.id, id), eq(audits.workspaceId, workspace.id)),
    });
    if (!audit) {
      throw new HttpError(404, "Audit not found");
    }

    // Self-heal for the status poller: an audit stranded in `running` (executor
    // killed without reaching executeAudit's catch) is settled as failed here,
    // so the poller un-wedges it instead of spinning forever.
    if (audit.status === "running" && Date.now() - audit.createdAt.getTime() > STALE_AUDIT_MS) {
      const [healed] = await db
        .update(audits)
        .set({
          status: "failed",
          error: "The audit was interrupted and timed out — run it again.",
          completedAt: new Date(),
        })
        .where(and(eq(audits.id, id), eq(audits.status, "running")))
        .returning({ status: audits.status, error: audits.error });
      if (healed) {
        audit.status = healed.status;
        audit.error = healed.error;
      }
    }

    // No findings exist until the audit settles — skip the query on the poll
    // hot path while it's still running.
    const findings =
      audit.status === "running"
        ? []
        : await db.select().from(auditFindings).where(eq(auditFindings.auditId, id));

    return jsonOk({ audit, findings });
  });
}
