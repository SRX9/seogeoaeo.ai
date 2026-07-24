import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createLogger,
  errorFields,
  logInfo,
  sanitizeLogFields,
} from "./logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logging", () => {
  it("redacts secrets and keeps scalar fields", () => {
    expect(
      sanitizeLogFields({
        workspaceId: "ws_1",
        apiKey: "should-not-leak",
        token: "nope",
        access_token: "also-nope",
        count: 3,
        nested: { a: 1 },
      }),
    ).toEqual({
      workspaceId: "ws_1",
      apiKey: "[redacted]",
      token: "[redacted]",
      access_token: "[redacted]",
      count: 3,
      nested: '{"a":1}',
    });
  });

  it("redacts credentials embedded inside error and nested text", () => {
    expect(
      sanitizeLogFields({
        error_summary:
          "Request used Authorization: Bearer abc.def and api_key=secret-value",
        nested: { password: "hidden-value" },
        endpoint: "https://admin:password@example.com/posts",
      }),
    ).toEqual({
      error_summary:
        "Request used Authorization: Bearer [redacted] and api_key=[redacted]",
      nested: '{"password":[redacted]}',
      endpoint: "https://[redacted]@example.com/posts",
    });
  });

  it("formats unknown errors", () => {
    expect(errorFields(new Error("boom"))).toEqual({
      error_name: "Error",
      error_message: "boom",
    });
  });

  it("redacts credentials from formatted errors", () => {
    expect(errorFields(new Error("Token private-value was rejected"))).toEqual({
      error_name: "Error",
      error_message: "Token [redacted] was rejected",
    });
  });

  it("writes structured JSON console lines with service metadata", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logInfo("cron.daily.started", { workspaceId: "ws_1", secret: "x" });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line.event).toBe("cron.daily.started");
    expect(line.level).toBe("info");
    expect(line["service.name"]).toBe("seo-ai");
    expect(line["deployment.environment.name"]).toBe("test");
    expect(line.workspaceId).toBe("ws_1");
    expect(line.secret).toBe("[redacted]");
  });

  it("binds context on createLogger", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = createLogger({ brandId: "b1", workspaceId: "w1" });
    log.error("workflow.daily.write.exhausted", { topicId: "t1" });
    const line = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(line.brandId).toBe("b1");
    expect(line.workspaceId).toBe("w1");
    expect(line.topicId).toBe("t1");
  });
});
