import { beforeEach, describe, expect, it, vi } from "vitest";
import { logError, logWarn } from "@/lib/logging/logger";
import {
  classifyPublishingFailure,
  logPublishingDestinationFailure,
  publishingFailureStatusCode,
} from "./observability";

vi.mock("@/lib/logging/logger", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

describe("publishing observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies common provider failure modes", () => {
    expect(classifyPublishingFailure("Qiita returned 401: unauthorized")).toBe(
      "authentication",
    );
    expect(classifyPublishingFailure("Buttondown returned 429: rate limited")).toBe(
      "provider_rate_limit",
    );
    expect(classifyPublishingFailure("Paragraph returned 422: invalid slug")).toBe(
      "provider_validation",
    );
    expect(classifyPublishingFailure("Qiita requires at least one article tag")).toBe(
      "provider_validation",
    );
    expect(classifyPublishingFailure("beehiiv returned 503: unavailable")).toBe(
      "provider_server",
    );
    expect(classifyPublishingFailure("Write.as request failed: connection reset")).toBe(
      "network",
    );
    expect(classifyPublishingFailure("beehiiv accepted the post but is still processing")).toBe(
      "delivery_uncertain",
    );
  });

  it("extracts a provider HTTP status without mistaking unrelated numbers", () => {
    expect(publishingFailureStatusCode("Qiita returned 403: forbidden")).toBe(403);
    expect(publishingFailureStatusCode("Attempt 401 failed")).toBeUndefined();
  });

  it("writes filterable destination failure context without remote identifiers", () => {
    logPublishingDestinationFailure({
      workspaceId: "ws-1",
      brandId: "brand-1",
      articleId: "article-1",
      provider: "qiita",
      actor: "owner",
      operation: "create",
      attemptCount: 2,
      deliveryState: "failed",
      error: "Qiita returned 401: unauthorized",
    });

    expect(logError).toHaveBeenCalledWith(
      "publish.destination_failed",
      expect.objectContaining({
        workspaceId: "ws-1",
        provider: "qiita",
        error_category: "authentication",
        provider_status_code: 401,
        attemptCount: 2,
        remote_id_present: false,
      }),
    );
    expect(logWarn).not.toHaveBeenCalled();
  });
});
