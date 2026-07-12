import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron/auth";
import { getDb } from "@/lib/db";
import { finishReaudit, runScheduledAnswerCheck } from "@/server/visibility/cron";
import { runManualAudit } from "@/server/visibility/manual-audit";
import { createAudit, executeAudit } from "@/server/visibility/run-audit";

type AuditStepBody = {
  /**
   * "manual" : user-triggered audit: execute + charge credits on success.
   * "create" : monitor: insert the new audit row, return its id.
   * "execute": monitor: run the audit for an existing row.
   * "finish" : monitor: autonomy dispatch + verification + delta + alert.
   * "answers": monitor: the AP4 cadence answer check (credit-gated, non-fatal).
   */
  step: "manual" | "create" | "execute" | "finish" | "answers";
  workspaceId: string;
  siteUrl: string;
  auditId?: string;
  baselineAuditId?: string;
  planId?: string | null;
};

/**
 * Steps are delivered at-least-once, so "create" must not mint a second row
 * when only the response was lost: any `running` row for the same site this
 * young is the previous attempt's: reuse it. (Also folds a concurrent manual
 * audit of the same site into one run instead of racing it.)
 */
const REUSABLE_RUNNING_MS = 30 * 60 * 1000;

async function createReauditRow(workspaceId: string, siteUrl: string): Promise<string> {
  const existing = await getDb().query.audits.findFirst({
    where: (table, { and, eq, gt }) =>
      and(
        eq(table.workspaceId, workspaceId),
        eq(table.siteUrl, siteUrl),
        eq(table.kind, "owned"),
        eq(table.status, "running"),
        gt(table.createdAt, new Date(Date.now() - REUSABLE_RUNNING_MS)),
      ),
    orderBy: (table, { desc }) => desc(table.createdAt),
    columns: { id: true },
  });
  if (existing?.id) return existing.id;
  const { resolveBrandForSite } = await import("@/server/visibility/autonomy");
  const brand = await resolveBrandForSite(workspaceId, siteUrl);
  return createAudit(workspaceId, siteUrl, "owned", brand?.brandId ?? null);
}

/**
 * Workflow step callback: one phase of a visibility audit run. Called by the
 * `AuditRunWorkflow` Worker. `executeAudit` never throws: a failed audit is
 * persisted on its row and comes back as `{ ok: false }` (terminal, no retry);
 * a thrown error here returns 500 and the Workflow retries the step.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AuditStepBody;
  try {
    body = (await request.json()) as AuditStepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    switch (body.step) {
      case "manual": {
        if (!body.auditId) return NextResponse.json({ error: "Missing auditId" }, { status: 400 });
        const ok = await runManualAudit(body.workspaceId, body.auditId, body.siteUrl);
        return NextResponse.json({ ok });
      }
      case "create": {
        const auditId = await createReauditRow(body.workspaceId, body.siteUrl);
        return NextResponse.json({ auditId });
      }
      case "execute": {
        if (!body.auditId) return NextResponse.json({ error: "Missing auditId" }, { status: 400 });
        const ok = await executeAudit(body.auditId, body.siteUrl);
        return NextResponse.json({ ok });
      }
      case "finish": {
        if (!body.auditId || !body.baselineAuditId) {
          return NextResponse.json({ error: "Missing auditId/baselineAuditId" }, { status: 400 });
        }
        const alerted = await finishReaudit({
          workspaceId: body.workspaceId,
          siteUrl: body.siteUrl,
          baselineAuditId: body.baselineAuditId,
          newAuditId: body.auditId,
          planId: body.planId ?? null,
        });
        return NextResponse.json({ alerted });
      }
      case "answers": {
        if (!body.auditId) return NextResponse.json({ error: "Missing auditId" }, { status: 400 });
        const result = await runScheduledAnswerCheck({
          workspaceId: body.workspaceId,
          siteUrl: body.siteUrl,
          newAuditId: body.auditId,
        });
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json({ error: `Unknown step "${String(body.step)}"` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
