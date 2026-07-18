import { describe, expect, it, vi, afterEach } from "vitest";
import {
  createLogger,
  errorFields,
  logError,
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
        count: 3,
        nested: { a: 1 },
      }),
    ).toEqual({
      workspaceId: "ws_1",
      apiKey: "[redacted]",
      token: "[redacted]",
      count: 3,
      nested: '{"a":1}',
    });
  });

  it("formats unknown errors", () => {
    expect(errorFields(new Error("boom"))).toEqual({
      error_name: "Error",
      error_message: "boom",
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
