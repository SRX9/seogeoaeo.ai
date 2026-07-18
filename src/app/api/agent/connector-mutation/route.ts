import { NextResponse } from "next/server";
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
  settleStepExecution,
  withStepHeartbeat,
  type ClassifiedExecutionError,
} from "@/lib/agent/execution";
import {
  connectorArticleMetadataInputSchema,
  connectorArticleMetadataOutputSchema,
  requireAgentTool,
} from "@/lib/agent/tool-registry";
import { getConnectorMutation } from "@/lib/connectors/repository";
import {
  applyConnectorMutation,
  ConnectorProtocolError,
  monitorConnectorMutation,
  rollbackConnectorMutation,
  verifyConnectorMutation,
} from "@/lib/connectors/service";
import { logError } from "@/lib/logging/logger";

const CONNECTOR_TOOL = requireAgentTool(
  "connector.wordpress.article_metadata",
  "1.0.0",
  "workflow",
);

const bodySchema = z
  .object({
    workspaceId: z.string().uuid(),
    brandId: z.string().uuid(),
    mutationId: z.string().uuid(),
    step: z.enum(["apply", "verify", "monitor", "rollback"]),
  })
  .strict();

type Body = z.infer<typeof bodySchema>;
type Scope = Pick<Body, "workspaceId" | "brandId">;

const handlers = {
  apply: applyConnectorMutation,
  verify: verifyConnectorMutation,
  monitor: monitorConnectorMutation,
  rollback: rollbackConnectorMutation,
} satisfies Record<Body["step"], (scope: Scope, mutationId: string) => Promise<unknown>>;

function classifyConnectorError(error: unknown): ClassifiedExecutionError {
  const classified = classifyExecutionError(error);
  if (!(error instanceof ConnectorProtocolError)) return classified;
  return {
    ...classified,
    code: error.code,
    retryable: error.retryable,
    message: error.message,
  };
}

/** Durable Workflow boundary for one mutation phase and its compensation. */
export async function POST(request: Request) {
  let body: Body;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(bodySchema, await readAgentCallbackJson(request));
    connectorArticleMetadataInputSchema.parse({ mutationId: body.mutationId });
    authorization = await authorizeAgentCallback(request, {
      workspaceId: body.workspaceId,
      brandId: body.brandId,
      step: body.step,
    });
    const mutation = await getConnectorMutation(
      { workspaceId: body.workspaceId, brandId: body.brandId },
      body.mutationId,
    );
    if (!mutation) {
      throw new AgentCallbackError(403, "Mutation does not belong to callback scope");
    }
    if (authorization.claims.workflowInstanceId !== `connector-${body.mutationId}`) {
      throw new AgentCallbackError(403, "Mutation workflow identity mismatch");
    }
  } catch (error) {
    return agentCallbackErrorResponse(error);
  }

  const scope = { workspaceId: body.workspaceId, brandId: body.brandId };
  const executorId = authorization.claims.requestId;
  const claimed = await claimStepExecution(
    {
      ...scope,
      workflowInstanceId: authorization.claims.workflowInstanceId,
      stepKey: `tool:${CONNECTOR_TOOL.name}@${CONNECTOR_TOOL.version}:${body.step}`,
      workKey: body.mutationId,
      input: {
        tool: { name: CONNECTOR_TOOL.name, version: CONNECTOR_TOOL.version },
        arguments: { mutationId: body.mutationId },
        phase: body.step,
      },
    },
    executorId,
  );
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      if (claimed.execution.outcome === "permanent_failure" && !claimed.execution.output) {
        return NextResponse.json(
          { error: claimed.execution.lastError ?? "Connector mutation permanently failed" },
          { status: 422 },
        );
      }
      const replay = connectorArticleMetadataOutputSchema.safeParse(claimed.execution.output);
      if (!replay.success) {
        logError("agent.connector_mutation.invalid_replay", {
          workspaceId: body.workspaceId,
          brandId: body.brandId,
          mutationId: body.mutationId,
          step: body.step,
          executionId: claimed.execution.id,
        });
        return NextResponse.json(
          { error: "Stored connector mutation result is invalid" },
          { status: 500 },
        );
      }
      return NextResponse.json(replay.data);
    }
    return NextResponse.json(
      { error: "Connector mutation has a live execution lease" },
      { status: 409 },
    );
  }

  try {
    const result = await withStepHeartbeat(claimed.execution.id, executorId, () =>
      handlers[body.step](scope, body.mutationId),
    );
    const output = connectorArticleMetadataOutputSchema.parse(result);
    await settleStepExecution(claimed.execution.id, executorId, "completed", {
      output,
      outputRef: body.mutationId,
    });
    return NextResponse.json(output);
  } catch (error) {
    const classified = classifyConnectorError(error);
    const retryAfter =
      error instanceof ConnectorProtocolError && error.retryAfterMs != null
        ? new Date(Date.now() + error.retryAfterMs)
        : undefined;
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      classified.retryable ? "transient_failure" : "permanent_failure",
      { error: classified, retryAfter },
    );
    logError("agent.connector_mutation.failed", {
      workspaceId: body.workspaceId,
      brandId: body.brandId,
      mutationId: body.mutationId,
      step: body.step,
      error: classified.message,
      errorCode: classified.code,
      errorClass: classified.errorClass,
      retryable: classified.retryable,
    });
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: classified.retryable ? 500 : 422 },
    );
  }
}
