import { z } from "zod";
import {
  handleApi,
  HttpError,
  jsonOk,
  parseBody,
  readJson,
  requireApiBrand,
} from "@/lib/api/server";
import { getRequestOrigin } from "@/lib/billing/access";
import { isActiveSubscription } from "@/lib/billing/plans";
import { generateArticleFromTopic } from "@/lib/articles/generate";
import { InsufficientCreditsError } from "@/lib/usage/credits";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Generate an article from a topic. Costs credits (drawn from the workspace
 * balance); without an active subscription the result stays a draft, since
 * publishing remains a paid feature. Errors map to status codes so the client
 * can route the user appropriately.
 */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { workspace, subscription, scope } = await requireApiBrand();
    const { topicId } = parseBody(z.object({ topicId: z.string().min(1) }), await readJson(request));

    const active = isActiveSubscription(subscription?.status);

    try {
      await assertWorkspaceRateLimit(workspace.id, "generate_article", 20, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Too many generations — try again later", { code: "RATE_LIMITED" });
      }
      throw error;
    }

    try {
      const origin = await getRequestOrigin();
      const { article } = await generateArticleFromTopic(scope, topicId, {
        forceDraft: !active,
        origin,
      });
      return jsonOk({ articleId: article.id });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        throw new HttpError(402, "Not enough credits to generate an article", {
          code: "INSUFFICIENT_CREDITS",
        });
      }
      throw error;
    }
  });
}
