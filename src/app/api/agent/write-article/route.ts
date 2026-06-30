import { NextResponse } from "next/server";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { isCronAuthorized } from "@/lib/cron/auth";
import { logError } from "@/lib/logging/logger";
import { InsufficientCreditsError } from "@/lib/usage/credits";

type WriteBody = {
  workspaceId: string;
  brandId: string;
  topicId: string;
  origin?: string;
};

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
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as WriteBody;
  const scope = { workspaceId: body.workspaceId, brandId: body.brandId };

  try {
    const { article } = await generateArticleFromTopic(scope, body.topicId, {
      origin: body.origin ?? process.env.BETTER_AUTH_URL,
    });
    return NextResponse.json({ status: "written", articleId: article.id });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json({ status: "insufficient_credits" });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Topic not found" || message === "Brand not found") {
      return NextResponse.json({ status: "skipped", reason: message });
    }
    logError("agent.write_article.failed", {
      workspaceId: body.workspaceId,
      topicId: body.topicId,
      error: message,
    });
    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}
