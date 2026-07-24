import { logError, logWarn } from "@/lib/logging/logger";
import type { IntegrationProviderId } from "@/lib/integrations/providers";

export type PublishingFailureCategory =
  | "authentication"
  | "configuration"
  | "delivery_uncertain"
  | "network"
  | "policy"
  | "provider_rate_limit"
  | "provider_response"
  | "provider_server"
  | "provider_validation"
  | "unknown";

export function publishingFailureStatusCode(error: string | undefined): number | undefined {
  const match = error?.match(/\b(?:returned|status)\s+([1-5]\d{2})\b/i);
  return match ? Number(match[1]) : undefined;
}

export function classifyPublishingFailure(
  error: string | undefined,
): PublishingFailureCategory {
  const message = error?.toLowerCase() ?? "";
  const statusCode = publishingFailureStatusCode(error);

  if (
    /\b(?:401|403)\b/.test(message) ||
    /unauthori[sz]ed|forbidden|authentication|invalid (?:api )?(?:key|token)|access denied/.test(
      message,
    )
  ) {
    return "authentication";
  }
  if (
    /not configured|not enabled|adapter is not available|setup is incomplete|requirements? (?:are |is )?(?:unmet|missing)|missing configuration/.test(
      message,
    )
  ) {
    return "configuration";
  }
  if (/paused by the owner|requires? approval|permission denied|policy|authority/.test(message)) {
    return "policy";
  }
  if (
    /response was lost|delivery (?:is )?uncertain|still processing|verification is pending|accepted the (?:article|post)/.test(
      message,
    )
  ) {
    return "delivery_uncertain";
  }
  if (
    /request failed|network error|fetch failed|timed? out|timeout|connection (?:reset|refused)|dns/.test(
      message,
    )
  ) {
    return "network";
  }
  if (statusCode === 429 || /rate.?limit|too many requests/.test(message)) {
    return "provider_rate_limit";
  }
  if (
    statusCode === 400 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 422
  ) {
    return "provider_validation";
  }
  if (/requires? at least one|invalid (?:field|request|slug|tag)|must be/.test(message)) {
    return "provider_validation";
  }
  if (statusCode !== undefined && statusCode >= 500) {
    return "provider_server";
  }
  if (
    /did not return|did not confirm|unexpected status|background creation failed|verification returned/.test(
      message,
    )
  ) {
    return "provider_response";
  }
  return "unknown";
}

type DestinationFailureInput = {
  workspaceId: string;
  brandId: string;
  articleId: string;
  provider: IntegrationProviderId;
  actor: "agent" | "owner";
  operation: "create" | "update";
  error: string;
  attemptCount?: number;
  deliveryState: "blocked" | "failed" | "pending" | "published";
  deliveryUncertain?: boolean;
  remoteIdPresent?: boolean;
};

export function logPublishingDestinationFailure(
  input: DestinationFailureInput,
  severity: "error" | "warn" = "error",
) {
  const fields = {
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    articleId: input.articleId,
    provider: input.provider,
    actor: input.actor,
    operation: input.operation,
    attemptCount: input.attemptCount,
    delivery_state: input.deliveryState,
    delivery_uncertain: input.deliveryUncertain ?? false,
    remote_id_present: input.remoteIdPresent ?? false,
    error_category: classifyPublishingFailure(input.error),
    provider_status_code: publishingFailureStatusCode(input.error),
    error_summary: input.error,
  };

  if (severity === "warn") {
    logWarn("publish.destination_blocked", fields);
    return;
  }
  logError("publish.destination_failed", fields);
}
