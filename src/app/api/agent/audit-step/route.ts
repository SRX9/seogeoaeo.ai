import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  agentCallbackErrorResponse,
  AgentCallbackError,
  authorizeAgentCallback,
  parseAgentCallbackBody,
  readAgentCallbackJson,
} from "@/lib/agent/callback-auth";
import {
  claimStepExecution,
  classifyExecutionError,
  recordStepOutputRef,
  settleStepExecution,
  withStepHeartbeat,
} from "@/lib/agent/execution";
import {
  requireAgentTool,
  visibilityAuditInputSchema,
  visibilityAuditOutputSchema,
} from "@/lib/agent/tool-registry";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema";
import { getBrand } from "@/lib/brand/repository";
import { finishReaudit, runScheduledAnswerCheck } from "@/server/visibility/cron";
import { runManualAudit } from "@/server/visibility/manual-audit";
import { createAudit, executeAudit } from "@/server/visibility/run-audit";

const VISIBILITY_AUDIT_TOOL = requireAgentTool(
  "visibility.audit.execute",
  "1.0.0",
  "workflow",
);

const httpUrlSchema = z.string().url().max(2_000).refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "siteUrl must use http or https");

const auditStepBodySchema = z.object({
  /**
   * "manual" : user-triggered audit: execute + charge credits on success.
   * "create" : monitor: insert the new audit row, return its id.
   * "execute": monitor: run the audit for an existing row.
   * "finish" : monitor: autonomy dispatch + verification + delta + alert.
   * "answers": monitor: the AP4 cadence answer check (credit-gated, non-fatal).
   */
  step: z.enum(["manual", "create", "execute", "finish", "answers"]),
  workspaceId: z.string().uuid(),
  siteUrl: httpUrlSchema,
  auditId: z.string().uuid().optional(),
  baselineAuditId: z.string().uuid().optional(),
  planId: z.enum(["free", "indie", "startup", "scale", "enterprise"]).nullable().optional(),
}).strict();

type AuditStepBody = z.infer<typeof auditStepBodySchema>;

async function assertAuditOwnership(body: AuditStepBody): Promise<void> {
  const ids = [body.auditId, body.baselineAuditId].filter(
    (value): value is string => Boolean(value),
  );
  if (ids.length === 0) return;
  const rows = await getDb()
    .select({ id: audits.id, brandId: audits.brandId, siteUrl: audits.siteUrl })
    .from(audits)
    .where(and(eq(audits.workspaceId, body.workspaceId), inArray(audits.id, ids)));
  if (rows.length !== new Set(ids).size || rows.some((row) => row.siteUrl !== body.siteUrl)) {
    throw new AgentCallbackError(403, "Audit does not belong to callback scope");
  }
  const brandIds = [...new Set(rows.flatMap((row) => row.brandId ? [row.brandId] : []))];
  const scopedBrands = await Promise.all(
    brandIds.map((brandId) => getBrand(body.workspaceId, brandId)),
  );
  if (scopedBrands.some((brand) => !brand)) {
    throw new AgentCallbackError(403, "Audit brand does not belong to callback workspace");
  }
}

async function createReauditRow(
  workspaceId: string,
  siteUrl: string,
  auditId: string,
): Promise<string> {
  const { resolveBrandForSite } = await import("@/server/visibility/autonomy");
  const brand = await resolveBrandForSite(workspaceId, siteUrl);
  return createAudit(workspaceId, siteUrl, "owned", brand?.brandId ?? null, auditId);
}

/**
 * Workflow step callback: one phase of a visibility audit run. Called by the
 * `AuditRunWorkflow` Worker. `executeAudit` never throws: a failed audit is
 * persisted on its row and comes back as `{ ok: false }` (terminal, no retry);
 * a thrown error here returns 500 and the Workflow retries the step.
 */
export async function POST(request: Request) {
  let body: AuditStepBody;
  let toolInput: z.infer<typeof visibilityAuditInputSchema> | null = null;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(auditStepBodySchema, await readAgentCallbackJson(request));
    authorization = await authorizeAgentCallback(request, {
      workspaceId: body.workspaceId,
      brandId: null,
      step: body.step,
    });
    await assertAuditOwnership(body);
    if (body.step === "execute") {
      if (!body.auditId) throw new AgentCallbackError(400, "Missing auditId");
      toolInput = visibilityAuditInputSchema.parse({
        auditId: body.auditId,
        siteUrl: body.siteUrl,
      });
    }
  } catch (error) {
    return agentCallbackErrorResponse(error);
  }

  const executorId = authorization.claims.requestId;
  const claimed = await claimStepExecution(
    {
      workspaceId: body.workspaceId,
      brandId: null,
      workflowInstanceId: authorization.claims.workflowInstanceId,
      stepKey: `audit:${body.step}`,
      workKey: body.auditId ?? body.baselineAuditId ?? body.siteUrl,
      input: {
        siteUrl: body.siteUrl,
        planId: body.planId ?? null,
        ...(toolInput
          ? {
              tool: {
                name: VISIBILITY_AUDIT_TOOL.name,
                version: VISIBILITY_AUDIT_TOOL.version,
              },
              arguments: toolInput,
            }
          : {}),
      },
    },
    executorId,
  );
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      if (claimed.execution.outcome === "permanent_failure" && !claimed.execution.output) {
        return NextResponse.json(
          { error: claimed.execution.lastError ?? "Audit step permanently failed" },
          { status: 422 },
        );
      }
      if (body.step === "execute") {
        const replay = visibilityAuditOutputSchema.safeParse(claimed.execution.output);
        if (!replay.success) {
          return NextResponse.json(
            { error: "Stored visibility audit result is invalid" },
            { status: 500 },
          );
        }
        return NextResponse.json(replay.data);
      }
      return NextResponse.json(claimed.execution.output);
    }
    return NextResponse.json({ error: "Audit step has a live execution lease" }, { status: 409 });
  }

  try {
    const output = await withStepHeartbeat(claimed.execution.id, executorId, async () => {
      let result: Record<string, unknown>;
      switch (body.step) {
      case "manual": {
        if (!body.auditId) throw new AgentCallbackError(400, "Missing auditId");
        const ok = await runManualAudit(body.workspaceId, body.auditId, body.siteUrl, {
          throwOnTransient: true,
        });
        result = { ok };
        break;
      }
      case "create": {
        const auditId = claimed.execution.outputRef ?? crypto.randomUUID();
        if (!claimed.execution.outputRef) {
          await recordStepOutputRef(claimed.execution.id, executorId, auditId);
        }
        await createReauditRow(body.workspaceId, body.siteUrl, auditId);
        result = { auditId };
        break;
      }
      case "execute": {
        if (!body.auditId) throw new AgentCallbackError(400, "Missing auditId");
        const ok = await executeAudit(body.auditId, body.siteUrl, { throwOnTransient: true });
        result = visibilityAuditOutputSchema.parse({ ok, auditId: body.auditId });
        break;
      }
      case "finish": {
        if (!body.auditId || !body.baselineAuditId) {
          throw new AgentCallbackError(400, "Missing auditId/baselineAuditId");
        }
        const alerted = await finishReaudit({
          workspaceId: body.workspaceId,
          siteUrl: body.siteUrl,
          baselineAuditId: body.baselineAuditId,
          newAuditId: body.auditId,
          planId: body.planId ?? null,
        });
        result = { alerted };
        break;
      }
      case "answers": {
        if (!body.auditId) throw new AgentCallbackError(400, "Missing auditId");
        const answerResult = await runScheduledAnswerCheck({
          workspaceId: body.workspaceId,
          siteUrl: body.siteUrl,
          newAuditId: body.auditId,
        });
        result = { ...answerResult };
        break;
      }
      default:
        throw new AgentCallbackError(400, `Unknown step "${String(body.step)}"`);
      }
      return result;
    });
    const terminalFailure = output.ok === false;
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      terminalFailure ? "permanent_failure" : "completed",
      { output, outputRef: typeof output.auditId === "string" ? output.auditId : undefined },
    );
    return NextResponse.json(output);
  } catch (error) {
    const classified = classifyExecutionError(error);
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      classified.retryable ? "transient_failure" : "permanent_failure",
      { error: classified },
    );
    return NextResponse.json(
      { error: classified.message, errorClass: classified.errorClass },
      { status: classified.retryable ? 500 : 422 },
    );
  }
}
