import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { isActiveSubscription } from "@/lib/billing/plans";
import { publishArticleToDestinations } from "@/lib/publishing/publish";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { errorFields, logError, logWarn } from "@/lib/logging/logger";
import { captureServerEvent } from "@/lib/posthog-server";

type RouteProps = { params: Promise<{ id: string }> };
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Publish an approved article to the brand's connected destinations (paid). */
export async function POST(_request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const [{ id }, { workspace, subscription, scope, session }] = await Promise.all([
      params,
      requireApiBrand(),
    ]);

    if (!isActiveSubscription(subscription?.status)) {
      throw new HttpError(402, "Publishing requires an active plan", { code: "UPGRADE_REQUIRED" });
    }

    try {
      await assertWorkspaceRateLimit(workspace.id, "publish_article", 30, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        logWarn("publish.request_rejected", {
          workspaceId: workspace.id,
          brandId: scope.brandId,
          articleId: id,
          actor: "owner",
          reason_code: "rate_limited",
        });
        throw new HttpError(429, "Several publish requests are already running. Wait a moment and try again.", { code: "RATE_LIMITED" });
      }
      throw error;
    }

    let results;
    try {
      results = await publishArticleToDestinations(scope, id);
    } catch (error) {
      logError("publish.failed", {
        workspaceId: workspace.id,
        brandId: scope.brandId,
        articleId: id,
        actor: "owner",
        failure_stage: "orchestration",
        ...errorFields(error),
      });
      throw new HttpError(502, "Publishing failed. Check your connections and try again.");
    }

    const published = results.filter((r) => r.result.ok && !r.result.skipped).length;
    const skipped = results.filter((r) => r.result.skipped).length;
    const failed = results.filter((r) => !r.result.ok).length;

    await captureServerEvent(session.user.id, "article_published", {
      published_destinations: published,
      skipped_destinations: skipped,
      failed_destinations: failed,
      outcome: failed > 0 ? "partial_or_failed" : published > 0 ? "published" : "unchanged",
    });

    return jsonOk({
      ok: true,
      published,
      skipped,
      failed,
      // True when every destination was already up to date: nothing was sent.
      unchanged: published === 0 && failed === 0 && skipped > 0,
    });
  });
}
