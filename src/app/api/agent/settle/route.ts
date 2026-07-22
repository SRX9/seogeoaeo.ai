import { NextResponse } from "next/server";
import { z } from "zod";
import {
  agentCallbackErrorResponse,
  authorizeAgentCallback,
  parseAgentCallbackBody,
  readAgentCallbackJson,
} from "@/lib/agent/callback-auth";
import {
  claimStepExecution,
  classifyExecutionError,
  type ExecutionOutcome,
  settleStepExecution,
  withStepHeartbeat,
} from "@/lib/agent/execution";
import {
  DAILY_SETTLEMENT_OPERATIONS,
  executeDailySettlementOperation,
} from "@/lib/jobs/daily";
import { settleScheduledWork } from "@/lib/jobs/scheduled-work";
import { persistDailySummaryReflection } from "@/lib/agent/reflection";

const settlementOperationSchema = z.enum(DAILY_SETTLEMENT_OPERATIONS);

function executionOutcomeForStatus(status: string): ExecutionOutcome {
  if (status === "completed_degraded") return "completed_degraded";
  if (status === "blocked") return "blocked";
  if (status === "paused_no_credits") return "insufficient_credits";
  if (status === "paused_by_owner") return "paused";
  if (status === "idle" || status === "no_topics") return "no_work";
  return "completed";
}

const settleBodySchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cap: z.number().int().min(0).max(100),
  writtenToday: z.number().int().min(0).max(10_000),
  priorResearched: z.number().int().min(0).max(10_000),
  generated: z.number().int().min(0).max(100),
  researchTopics: z.number().int().min(0).max(1_000),
  hadTargets: z.boolean(),
  outOfCredits: z.boolean(),
  writeFailures: z.array(z.object({
    topicId: z.string().uuid(),
    outcome: z.enum(["blocked", "transient_failure", "permanent_failure"]),
    errorClass: z.string().min(1).max(120),
  }).strict()).max(100).optional(),
  brandName: z.string().trim().min(1).max(200).optional(),
  planId: z.enum(["free", "indie", "startup", "scale", "enterprise"]).nullable().optional(),
  operation: settlementOperationSchema.optional(),
}).strict();

/** Workflow step: record the day's final state and (if paused) email the owner. */
export async function POST(request: Request) {
  let body: z.infer<typeof settleBodySchema>;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(settleBodySchema, await readAgentCallbackJson(request));
    authorization = await authorizeAgentCallback(request, { ...body, step: "settle" });
  } catch (error) {
    return agentCallbackErrorResponse(error);
  }

  const operation = body.operation ?? "settle_daily_run";
  const scope = { workspaceId: body.workspaceId, brandId: body.brandId };
  const executorId = authorization.claims.requestId;
  const claimed = await claimStepExecution(
    {
      workspaceId: body.workspaceId,
      brandId: body.brandId,
      // Settlement side effects are idempotent, but each physical replay must
      // execute them with its new result instead of returning the prior
      // logical run's cached blocked/degraded output.
      workflowInstanceId: authorization.claims.workflowInstanceId,
      stepKey: `daily-settle:${operation}`,
      workKey: body.runDate,
      input: {
        runDate: body.runDate,
        operation,
        cap: body.cap,
        writtenToday: body.writtenToday,
        priorResearched: body.priorResearched,
        generated: body.generated,
        researchTopics: body.researchTopics,
        hadTargets: body.hadTargets,
        outOfCredits: body.outOfCredits,
        writeFailures: body.writeFailures ?? [],
      },
    },
    executorId,
  );
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      if (operation === "record_summary_job") {
        try {
          await persistDailySummaryReflection(scope, claimed.execution.id);
        } catch (error) {
          const classified = classifyExecutionError(error);
          return NextResponse.json(
            { error: classified.message, errorClass: classified.errorClass, operation },
            { status: 500 },
          );
        }
      }
      if (claimed.execution.outcome === "permanent_failure") {
        return NextResponse.json(
          { error: claimed.execution.lastError ?? "Settlement permanently failed", operation },
          { status: 422 },
        );
      }
      return NextResponse.json(claimed.execution.output ?? { ok: true, status: claimed.execution.outcome });
    }
    return NextResponse.json({ error: "Settlement operation has a live execution lease" }, { status: 409 });
  }

  let executionSettled = false;
  try {
    const status = await withStepHeartbeat(claimed.execution.id, executorId, () =>
      executeDailySettlementOperation(
        scope,
        body.runDate,
        {
          cap: body.cap,
          writtenToday: body.writtenToday,
          priorResearched: body.priorResearched,
          generated: body.generated,
          researchTopics: body.researchTopics,
          hadTargets: body.hadTargets,
          outOfCredits: body.outOfCredits,
          writeFailures: body.writeFailures,
          brandName: body.brandName,
          planId: body.planId,
        },
        operation,
      ),
    );
    const output = {
      ok: true,
      status,
      operation,
      generated: body.generated,
      researchTopics: body.researchTopics,
      writeFailureCount: body.writeFailures?.length ?? 0,
    };
    if (operation === "record_summary_job" || operation === "send_notifications") {
      await settleScheduledWork(authorization.claims.workflowInstanceId);
    }
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      executionOutcomeForStatus(status),
      { output },
    );
    executionSettled = true;
    if (operation === "record_summary_job") {
      await persistDailySummaryReflection(scope, claimed.execution.id);
    }
    return NextResponse.json(output);
  } catch (error) {
    const classified = classifyExecutionError(error);
    if (!executionSettled) {
      await settleStepExecution(
        claimed.execution.id,
        executorId,
        classified.retryable ? "transient_failure" : "permanent_failure",
        { error: classified },
      );
      if (!classified.retryable && operation === "record_summary_job") {
        try {
          await persistDailySummaryReflection(scope, claimed.execution.id);
        } catch (reflectionError) {
          const reflectionFailure = classifyExecutionError(reflectionError);
          return NextResponse.json(
            {
              error: reflectionFailure.message,
              errorClass: reflectionFailure.errorClass,
              operation,
            },
            { status: 500 },
          );
        }
      }
    }
    return NextResponse.json(
      { error: classified.message, errorClass: classified.errorClass, operation },
      { status: classified.retryable ? 500 : 422 },
    );
  }
}
