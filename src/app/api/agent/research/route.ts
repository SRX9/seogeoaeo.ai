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
  withStepHeartbeat,
} from "@/lib/agent/execution";
import {
  requireAgentTool,
  researchRefreshInputSchema,
  researchRefreshOutputSchema,
} from "@/lib/agent/tool-registry";
import { researchForDaily } from "@/lib/jobs/daily";

const RESEARCH_TOOL = requireAgentTool("research.refresh", "1.0.0", "workflow");

const researchBodySchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  budget: z.number().int().min(0).max(100),
  idempotencyKey: z.string().min(1).max(200),
}).strict();

/** Workflow step: one quality-safe research run to top up the topic queue. */
export async function POST(request: Request) {
  let body: z.infer<typeof researchBodySchema>;
  let toolInput: z.infer<typeof researchRefreshInputSchema>;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(researchBodySchema, await readAgentCallbackJson(request));
    toolInput = researchRefreshInputSchema.parse({ budget: body.budget });
    authorization = await authorizeAgentCallback(request, { ...body, step: "research" });
  } catch (error) {
    return agentCallbackErrorResponse(error);
  }
  const executorId = authorization.claims.requestId;
  const claimed = await claimStepExecution(
    {
      workspaceId: body.workspaceId,
      brandId: body.brandId,
      workflowInstanceId: body.idempotencyKey,
      stepKey: "daily:research",
      workKey: body.idempotencyKey,
      input: {
        tool: { name: RESEARCH_TOOL.name, version: RESEARCH_TOOL.version },
        arguments: toolInput,
      },
    },
    executorId,
  );
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      if (claimed.execution.outcome === "permanent_failure") {
        return NextResponse.json(
          { error: claimed.execution.lastError ?? "Daily research permanently failed" },
          { status: 422 },
        );
      }
      const replay = researchRefreshOutputSchema.safeParse(claimed.execution.output);
      if (!replay.success) {
        return NextResponse.json({ error: "Stored research result is invalid" }, { status: 500 });
      }
      return NextResponse.json(replay.data);
    }
    return NextResponse.json({ error: "Daily research has a live execution lease" }, { status: 409 });
  }
  try {
    const result = await withStepHeartbeat(claimed.execution.id, executorId, () =>
      researchForDaily(
        { workspaceId: body.workspaceId, brandId: body.brandId },
        body.budget,
        body.idempotencyKey,
        claimed.execution.billingWorkId,
      ),
    );
    const output = researchRefreshOutputSchema.parse(result);
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      output.researchTopics > 0 ? "completed" : "no_work",
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
    return NextResponse.json({ error: classified.message }, { status: classified.retryable ? 500 : 422 });
  }
}
