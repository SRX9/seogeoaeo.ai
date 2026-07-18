import { describe, expect, it } from "vitest";
import { canTakeOverLease, classifyExecutionError } from "./execution";

describe("durable execution policy", () => {
  it("permits takeover only after the live lease expires", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    expect(canTakeOverLease({ status: "running", leaseExpiresAt: new Date("2026-07-14T12:01:00Z") }, now)).toBe(false);
    expect(canTakeOverLease({ status: "running", leaseExpiresAt: new Date("2026-07-14T11:59:00Z") }, now)).toBe(true);
  });

  it("never reclaims a terminal execution", () => {
    expect(canTakeOverLease({ status: "completed", leaseExpiresAt: null })).toBe(false);
  });

  it("classifies rate limits as transient and validation as permanent", () => {
    expect(classifyExecutionError({ status: 429, message: "Too many requests" }).retryable).toBe(true);
    expect(classifyExecutionError(new Error("Malformed schema response")).retryable).toBe(false);
  });
});
