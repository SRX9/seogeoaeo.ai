import { describe, expect, it } from "vitest";
import { computeDelta, trendFor, type AuditSummary } from "./compare";

const summary = (over: Partial<AuditSummary> = {}): AuditSummary => ({
  overall: 60,
  subScores: { citability: 60, brand: 50, eeat: 60, technical: 70, schema: 40, platform: 55 },
  platforms: { ChatGPT: 60, Perplexity: 50 },
  resolvedFindings: 0,
  totalFindings: 10,
  scorerVersion: 3,
  ...over,
});

describe("trendFor", () => {
  it("maps deltas to the ▲▲/▲/──/▼/▼▼ symbols", () => {
    expect(trendFor(12)).toBe("▲▲");
    expect(trendFor(4)).toBe("▲");
    expect(trendFor(0)).toBe("──");
    expect(trendFor(-4)).toBe("▼");
    expect(trendFor(-10)).toBe("▼▼");
  });
});

describe("computeDelta", () => {
  it("computes overall + sub-score + platform deltas with trends", () => {
    const report = computeDelta(
      summary({ overall: 61 }),
      summary({ overall: 74, subScores: { citability: 72, brand: 55, eeat: 60, technical: 78, schema: 50, platform: 60 }, resolvedFindings: 4 }),
    );
    expect(report.overall.delta).toBe(13);
    expect(report.overall.trend).toBe("▲▲");
    expect(report.subScores.find((s) => s.key === "technical")!.delta).toBe(8);
    expect(report.platforms.find((p) => p.key === "ChatGPT")).toBeDefined();
    expect(report.actionItems.resolved).toBe(4);
    expect(report.trajectory).toHaveLength(6);
    expect(report.baselineOnly).toBe(false);
  });

  it("handles the baseline-only case (same summary → zero deltas)", () => {
    const only = summary();
    const report = computeDelta(only, only);
    expect(report.baselineOnly).toBe(true);
    expect(report.overall.delta).toBe(0);
    expect(report.overall.trend).toBe("──");
  });

  it("caveats the impact line when the scorer version changed between runs", () => {
    const report = computeDelta(
      summary({ overall: 61, scorerVersion: 2 }),
      summary({ overall: 74, scorerVersion: 3 }),
    );
    expect(report.impact).toContain("scoring methodology was upgraded");
  });

  it("does not caveat when both runs share a scorer version", () => {
    const report = computeDelta(summary({ overall: 61 }), summary({ overall: 74 }));
    expect(report.impact).not.toContain("scoring methodology was upgraded");
  });
});
