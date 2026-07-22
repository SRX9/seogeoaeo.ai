import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generateArticleFromTopic } from "@/lib/articles/generate";
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
import { getDb } from "@/lib/db";
import { topics } from "@/lib/db/schema";
import { logError } from "@/lib/logging/logger";
import { progressDailyAgentTask } from "@/lib/agent/planner";
import { InsufficientCreditsError } from "@/lib/usage/credits";
import { AgentSafetyError } from "@/lib/agent/safety";


const writeBodySchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  topicId: z.string().uuid(),
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  origin: z.string().url().max(2_000).optional(),
}).strict();

/**
 * Workflow step: generate one article for a topic. Reuses the existing pipeline
 * (which is idempotent via the article-by-topic guard, so a retried step that
 * finds the article re-charges nothing).
 *
 * Status drives the Workflow loop:
 *  - `written`              → counted, continue
 *  - `insufficient_credits` → stop the day (deterministic, NOT a retry → HTTP 200)
 *  - `skipped`              → permanent (topic/brand gone) → 200, continue
 *  - `failed`               → transient → HTTP 500 so the step retries
 */
export async function POST(request: Request) {
  let body: z.infer<typeof writeBodySchema>;
  let authorization: Awaited<ReturnType<typeof authorizeAgentCallback>>;
  try {
    body = parseAgentCallbackBody(writeBodySchema, await readAgentCallbackJson(request));
    authorization = await authorizeAgentCallback(request, { ...body, step: "write-article" });
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
      workflowInstanceId: body.runDate
        ? `daily-${body.brandId}-${body.runDate}`
        : authorization.claims.workflowInstanceId,
      stepKey: "write-article",
      workKey: body.topicId,
      input: { topicId: body.topicId, runDate: body.runDate ?? null },
    },
    executorId,
  );
  if (!claimed.claimed) {
    if (claimed.reason === "settled") {
      return NextResponse.json(claimed.execution.output ?? { status: claimed.execution.outcome });
    }
    return NextResponse.json({ error: "Article work has a live execution lease" }, { status: 409 });
  }

  try {
    const { article } = await withStepHeartbeat(claimed.execution.id, executorId, () =>
      generateArticleFromTopic(scope, body.topicId, {
        actor: "agent",
        origin: body.origin ?? process.env.BETTER_AUTH_URL,
        billingWorkId: claimed.execution.billingWorkId,
        stepExecutionId: claimed.execution.id,
      }),
    );
    if (body.runDate) {
      try {
        await progressDailyAgentTask(scope, body.runDate, article.id);
      } catch (progressError) {
        logError("agent.daily_task_progress_failed", {
          workspaceId: body.workspaceId,
          topicId: body.topicId,
          error:
            progressError instanceof Error ? progressError.message : "Unknown error",
        });
      }
    }
    const output = { status: "written" as const, articleId: article.id };
    await settleStepExecution(claimed.execution.id, executorId, "completed", {
      output,
      outputRef: article.id,
    });
    return NextResponse.json(output);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      const output = { status: "insufficient_credits" as const };
      await settleStepExecution(claimed.execution.id, executorId, "insufficient_credits", { output });
      return NextResponse.json(output);
    }
    if (error instanceof AgentSafetyError) {
      const output = { status: "blocked" as const, reason: error.message };
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
      const output = { status: "blocked" as const, reason: message };
      await settleStepExecution(claimed.execution.id, executorId, "blocked", { output });
      return NextResponse.json(output);
    }
    const classified = classifyExecutionError(error);
    logError("agent.write_article.failed", {
      workspaceId: body.workspaceId,
      topicId: body.topicId,
      error: classified.message,
      errorClass: classified.errorClass,
      retryable: classified.retryable,
    });
    const output = {
      status: classified.retryable ? ("transient_failure" as const) : ("permanent_failure" as const),
      error: classified.message,
      errorClass: classified.errorClass,
    };
    await settleStepExecution(
      claimed.execution.id,
      executorId,
      classified.retryable ? "transient_failure" : "permanent_failure",
      { output, error: classified },
    );
    return NextResponse.json(output, { status: classified.retryable ? 500 : 200 });
  }
}
