import { handleApi, HttpError, jsonOk, requireApiBrand } from "@/lib/api/server";
import { isActiveSubscription } from "@/lib/billing/plans";
import { ConnectorGuardrailError } from "@/lib/connectors/repository";
import {
  ConnectorProtocolError,
  prepareWordPressArticleMetadataMutation,
} from "@/lib/connectors/service";
import {
  ConnectorTriggerError,
  triggerConnectorMutation,
} from "@/lib/connectors/trigger";
import { assertWorkspaceRateLimit, RateLimitError } from "@/lib/security/rate-limit";

type RouteProps = { params: Promise<{ id: string }> };

const ONE_HOUR_MS = 60 * 60 * 1_000;

function rethrowAsHttpError(error: unknown): never {
  if (error instanceof ConnectorProtocolError) {
    throw new HttpError(error.status, error.message, {
      code: error.code,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
    });
  }
  if (error instanceof ConnectorGuardrailError) {
    const status = [
      "brand_daily_limit",
      "workspace_monthly_limit",
      "resource_cooldown",
    ].includes(error.code)
      ? 429
      : 409;
    throw new HttpError(status, error.message, { code: error.code });
  }
  if (error instanceof ConnectorTriggerError) {
    throw new HttpError(error.status, error.message, { code: error.code });
  }
  throw error;
}

/** Start a certified, reversible WordPress slug/excerpt synchronization. */
export async function POST(_request: Request, { params }: RouteProps) {
  return handleApi(async () => {
    const [{ id }, { workspace, subscription, scope }] = await Promise.all([
      params,
      requireApiBrand(),
    ]);
    if (!isActiveSubscription(subscription?.status)) {
      throw new HttpError(402, "Live metadata sync requires an active plan", {
        code: "UPGRADE_REQUIRED",
      });
    }

    try {
      await assertWorkspaceRateLimit(workspace.id, "sync_article_metadata", 10, ONE_HOUR_MS);
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new HttpError(
          429,
          "Several metadata sync requests are already running. Wait a moment and try again.",
          { code: "RATE_LIMITED" },
        );
      }
      throw error;
    }

    try {
      const mutation = await prepareWordPressArticleMetadataMutation(scope, id, {
        actor: "owner",
      });
      const execution = await triggerConnectorMutation(scope, mutation);
      return jsonOk(
        {
          ok: execution.ok,
          mutationId: execution.mutationId,
          status: execution.status,
          execution: execution.mode,
          alreadyRunning: execution.enqueue === "exists",
          restarted: execution.enqueue === "restarted",
        },
        { status: execution.mode === "workflow" ? 202 : 200 },
      );
    } catch (error) {
      rethrowAsHttpError(error);
    }
  });
}
