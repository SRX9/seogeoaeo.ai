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
  settleStepExecution,
} from "@/lib/agent/execution";
import { planDailyForBrand } from "@/lib/jobs/daily";
import { settleScheduledWork } from "@/lib/jobs/scheduled-work";

const planBodySchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  planId: z.enum(["free", "indie", "startup", "scale", "enterprise"]).nullable().optional(),
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

/** Workflow step: decide a brand's budget and initial write targets for the day. */
export async function POST(request: Request) {
  let body: z.infer<typeof planBodySchema>;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(planBodySchema, await readAgentCallbackJson(request));
    authorization = await authorizeAgentCallback(request, { ...body, step: "plan" });
  } catch (error) {
    return agentCallbackErrorResponse(error);
  }
  const executorId = authorization.claims.requestId;
  const claimed = await claimStepExecution(
    {
      workspaceId: body.workspaceId,
      brandId: body.brandId,
      workflowInstanceId: `daily-${body.brandId}-${body.runDate}`,
      stepKey: "daily:plan",
      workKey: body.runDate,
      input: { runDate: body.runDate, planId: body.planId ?? null },
    },
    executorId,
  );
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      if (claimed.execution.outcome === "permanent_failure") {
        return NextResponse.json(
          { error: claimed.execution.lastError ?? "Daily planning permanently failed" },
          { status: 422 },
        );
      }
      return NextResponse.json(claimed.execution.output);
    }
    return NextResponse.json({ error: "Daily plan has a live execution lease" }, { status: 409 });
  }
  try {
    const plan = await planDailyForBrand(
      { workspaceId: body.workspaceId, brandId: body.brandId },
      body.planId ?? null,
      body.runDate,
    );
    if (plan.skip) await settleScheduledWork(authorization.claims.workflowInstanceId);
    await settleStepExecution(claimed.execution.id, executorId, plan.skip ? "no_work" : "completed", {
      output: plan,
    });
    return NextResponse.json(plan);
  } catch (error) {
    const classified = classifyExecutionError(error);
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      classified.retryable ? "transient_failure" : "permanent_failure",
      { error: classified },
    );
    return NextResponse.json({ error: classified.message }, { status: classified.retryable ? 500 : 422 });
  }
}
