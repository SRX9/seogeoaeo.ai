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
  recordStepOutputRef,
  settleStepExecution,
  withStepHeartbeat,
} from "@/lib/agent/execution";
import {
  executeSetupStep,
  finalizeSetupRun,
  getSetupRun,
  SETUP_STEPS,
  type SetupStepKey,
} from "@/lib/jobs/setup-run";
import { logError } from "@/lib/logging/logger";

const setupStepBodySchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  planId: z.enum(["free", "indie", "startup", "scale", "enterprise"]).nullable().optional(),
  step: z.string().min(1).max(80),
}).strict();

const STEP_KEYS = new Set<string>(SETUP_STEPS.map((s) => s.key));

/**
 * Workflow step callback: run exactly one Setup Run step (or finalize) for a
 * brand. Called by the `SetupRunWorkflow` Worker; each call persists the step's
 * outcome before returning, so the Workflow's checkpoint and the DB agree. A
 * thrown step returns 500: persisted as `failed`: and the Workflow retries.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof setupStepBodySchema>;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(setupStepBodySchema, await readAgentCallbackJson(request));
    authorization = await authorizeAgentCallback(request, { ...body, step: body.step });
  } catch (error) {
    return agentCallbackErrorResponse(error);
  }
  const scope = { workspaceId: body.workspaceId, brandId: body.brandId };
  const executorId = authorization.claims.requestId;
  // Infra failures before the work starts (DB down, driver bug) must return a
  // structured, logged 500 — an unhandled throw here is invisible in our own
  // telemetry and shows up only as a bare "-> 500" in the Workflow's history.
  let claimed: Awaited<ReturnType<typeof claimStepExecution>>;
  let logicalWorkflowId: string;
  try {
    const setupRun = await getSetupRun(body.brandId);
    logicalWorkflowId = setupRun
      ? `setup-${setupRun.id}`
      : authorization.claims.workflowInstanceId;
    claimed = await claimStepExecution(
      {
        ...scope,
        workflowInstanceId: logicalWorkflowId,
        stepKey: `setup:${body.step}`,
        input: { planId: body.planId ?? null },
      },
      executorId,
    );
  } catch (error) {
    const classified = classifyExecutionError(error);
    logError("setup_step.claim_failed", {
      ...scope,
      step: body.step,
      errorClass: classified.errorClass,
      error: classified.message.slice(0, 500),
    });
    return NextResponse.json({ error: classified.message }, { status: 500 });
  }
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      return NextResponse.json(claimed.execution.output ?? { status: claimed.execution.outcome });
    }
    return NextResponse.json({ error: "Setup step has a live execution lease" }, { status: 409 });
  }

  if (!STEP_KEYS.has(body.step)) {
    if (body.step !== "finalize") {
      const error = classifyExecutionError(new Error(`Unknown step "${body.step}"`));
      await settleStepExecution(claimed.execution.id, executorId, "permanent_failure", { error });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  try {
    if (body.step === "finalize") {
      const run = await finalizeSetupRun(scope);
      const output = { status: run?.status ?? "failed" };
      await settleStepExecution(claimed.execution.id, executorId, "completed", { output });
      return NextResponse.json(output);
    }

    const step = await withStepHeartbeat(claimed.execution.id, executorId, () =>
      executeSetupStep(scope, body.planId ?? null, body.step as SetupStepKey, {
      billingWorkId: claimed.execution.billingWorkId,
      outputRef: claimed.execution.outputRef,
      recordOutputRef: (outputRef) =>
        recordStepOutputRef(claimed.execution.id, executorId, outputRef),
      checkpoint: async (key, work) => {
        const child = await claimStepExecution(
          {
            ...scope,
            workflowInstanceId: logicalWorkflowId,
            stepKey: `setup:${body.step}:${key}`,
            workKey: body.step,
          },
          executorId,
        );
        if (!child.claimed) {
          if (child.reason === "settled" && child.execution.output) {
            return child.execution.output as Awaited<ReturnType<typeof work>>;
          }
          throw new Error(`Setup checkpoint ${key} has a live execution lease`);
        }
        try {
          const output = await withStepHeartbeat(child.execution.id, executorId, () =>
            work({
              billingWorkId: child.execution.billingWorkId,
              outputRef: child.execution.outputRef,
              recordOutputRef: (outputRef) =>
                recordStepOutputRef(child.execution.id, executorId, outputRef),
            }),
          );
          await settleStepExecution(child.execution.id, executorId, "completed", { output });
          return output;
        } catch (error) {
          const classified = classifyExecutionError(error);
          await settleStepExecution(
            child.execution.id,
            executorId,
            classified.retryable ? "transient_failure" : "permanent_failure",
            { error: classified },
          );
          throw error;
        }
      },
    }),
    );
    const output = { status: step.status, note: step.note ?? null };
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      step.status === "skipped" ? "no_work" : "completed",
      { output },
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
    if (!classified.retryable) {
      return NextResponse.json({ status: "failed", error: classified.message });
    }
    return NextResponse.json({ error: classified.message }, { status: 500 });
  }
}
