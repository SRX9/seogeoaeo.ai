import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { isActiveSubscription } from "@/lib/billing/plans";
import { publishArticleToDestinations } from "@/lib/publishing/publish";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { logError } from "@/lib/logging/logger";

type RouteProps = { params: Promise<{ id: string }> };
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Publish an approved article to the brand's connected destinations (paid). */
export async function POST(_request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const { id } = await params;
    const { workspace, subscription, scope } = await requireApiBrand();

    if (!isActiveSubscription(subscription?.status)) {
      throw new HttpError(402, "Publishing requires an active plan", { code: "UPGRADE_REQUIRED" });
    }

    try {
      await assertWorkspaceRateLimit(workspace.id, "publish_article", 30, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(429, "Too many publishes — try again later", { code: "RATE_LIMITED" });
      }
      throw error;
    }

    let results;
    try {
      results = await publishArticleToDestinations(scope, id);
    } catch (error) {
      logError("publish.failed", {
        workspaceId: workspace.id,
        articleId: id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new HttpError(502, "Publishing failed — check your integrations and try again");
    }

    const published = results.filter((r) => r.result.ok && !r.result.skipped).length;
    const skipped = results.filter((r) => r.result.skipped).length;
    const failed = results.filter((r) => !r.result.ok).length;

    return jsonOk({
      ok: true,
      published,
      skipped,
      failed,
      // True when every destination was already up to date — nothing was sent.
      unchanged: published === 0 && failed === 0 && skipped > 0,
    });
  });
}
