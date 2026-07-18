import { and, eq } from "drizzle-orm";
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
} from "@/lib/agent/execution";
import { AgentSafetyError } from "@/lib/agent/safety";
import {
  articleDraftExecutionOutputSchema,
  articleDraftInputSchema,
  articleDraftOutputSchema,
  requireAgentTool,
} from "@/lib/agent/tool-registry";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { getDb } from "@/lib/db";
import { topics } from "@/lib/db/schema";
import { logError } from "@/lib/logging/logger";
import { InsufficientCreditsError } from "@/lib/usage/credits";

const ARTICLE_DRAFT_TOOL = requireAgentTool("article.draft", "1.0.0", "workflow");

const bodySchema = z
  .object({
    workspaceId: z.string().uuid(),
    brandId: z.string().uuid(),
    topicId: z.string().uuid(),
  })
  .strict();

/**
 * Versioned article.draft tool boundary. Unlike the legacy daily write route,
 * this callback can only create a local draft and can never publish remotely.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  let toolInput: z.infer<typeof articleDraftInputSchema>;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(bodySchema, await readAgentCallbackJson(request));
    toolInput = articleDraftInputSchema.parse({ topicId: body.topicId });
    authorization = await authorizeAgentCallback(request, {
      workspaceId: body.workspaceId,
      brandId: body.brandId,
      step: "draft-article",
    });
    const [topic] = await getDb()
      .select({ id: topics.id })
      .from(topics)
      .where(
        and(
          eq(topics.id, body.topicId),
          eq(topics.workspaceId, body.workspaceId),
          eq(topics.brandId, body.brandId),
        ),
      )
      .limit(1);
    if (!topic) throw new AgentCallbackError(403, "Topic does not belong to callback scope");
  } catch (error) {
    return agentCallbackErrorResponse(error);
  }

  const scope = { workspaceId: body.workspaceId, brandId: body.brandId };
  const executorId = authorization.claims.requestId;
  const claimed = await claimStepExecution(
    {
      ...scope,
      workflowInstanceId: authorization.claims.workflowInstanceId,
      stepKey: `tool:${ARTICLE_DRAFT_TOOL.name}@${ARTICLE_DRAFT_TOOL.version}`,
      workKey: body.topicId,
      input: {
        tool: { name: ARTICLE_DRAFT_TOOL.name, version: ARTICLE_DRAFT_TOOL.version },
        arguments: toolInput,
      },
    },
    executorId,
  );
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      if (claimed.execution.outcome === "permanent_failure" && !claimed.execution.output) {
        return NextResponse.json(
          { error: claimed.execution.lastError ?? "Article draft permanently failed" },
          { status: 422 },
        );
      }
      const replay = articleDraftExecutionOutputSchema.safeParse(claimed.execution.output);
      if (!replay.success) {
        logError("agent.article_draft.invalid_replay", {
          workspaceId: body.workspaceId,
          brandId: body.brandId,
          topicId: body.topicId,
          executionId: claimed.execution.id,
        });
        return NextResponse.json({ error: "Stored article draft result is invalid" }, { status: 500 });
      }
      return NextResponse.json(replay.data);
    }
    return NextResponse.json({ error: "Article draft has a live execution lease" }, { status: 409 });
  }

  try {
    const result = await withStepHeartbeat(claimed.execution.id, executorId, () =>
      generateArticleFromTopic(scope, body.topicId, {
        actor: "agent",
        billingWorkId: claimed.execution.billingWorkId,
        forceDraft: true,
        autoPublish: false,
      }),
    );
    const output = articleDraftOutputSchema.parse({
      status: "available",
      articleId: result.article.id,
    });
    await settleStepExecution(claimed.execution.id, executorId, "completed", {
      output,
      outputRef: result.article.id,
    });
    return NextResponse.json(output);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      const output = articleDraftExecutionOutputSchema.parse({
        status: "insufficient_credits",
      });
      await settleStepExecution(claimed.execution.id, executorId, "insufficient_credits", {
        output,
      });
      return NextResponse.json(output);
    }
    if (error instanceof AgentSafetyError) {
      const output = articleDraftExecutionOutputSchema.parse({
        status: "blocked",
        reason: error.message,
      });
      await settleStepExecution(claimed.execution.id, executorId, "blocked", { output });
      return NextResponse.json(output);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    if (
      message === "Topic not found" ||
      message === "Brand not found" ||
      message === "Agent paused by owner" ||
      message.startsWith("Agent blocked by owner constraint:")
    ) {
      const output = articleDraftExecutionOutputSchema.parse({
        status: "blocked",
        reason: message,
      });
      await settleStepExecution(claimed.execution.id, executorId, "blocked", { output });
      return NextResponse.json(output);
    }
    const classified = classifyExecutionError(error);
    logError("agent.article_draft.failed", {
      workspaceId: body.workspaceId,
      brandId: body.brandId,
      topicId: body.topicId,
      error: classified.message,
      errorClass: classified.errorClass,
      retryable: classified.retryable,
    });
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
