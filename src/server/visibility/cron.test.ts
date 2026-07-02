import { describe, expect, it } from "vitest";
import type { DeltaReport } from "@/lib/visibility/compare";
import { shouldAlert } from "./cron";

const delta = (overallDelta: number): DeltaReport => ({
  overall: { key: "overall", label: "Overall", baseline: 70, current: 70 + overallDelta, delta: overallDelta, trend: "──" },
  subScores: [],
  platforms: [],
  actionItems: { resolved: 0, total: 0 },
  trajectory: [],
  impact: "",
  baselineOnly: false,
});

describe("shouldAlert", () => {
  it("alerts on a material score drop", () => {
    const d = shouldAlert(delta(-9), 0);
    expect(d.alert).toBe(true);
    expect(d.reasons[0]).toContain("fell 9");
  });

  it("alerts on a new critical finding", () => {
    const d = shouldAlert(delta(2), 1);
    expect(d.alert).toBe(true);
    expect(d.reasons.some((r) => r.includes("critical"))).toBe(true);
  });

  it("stays quiet on a small change and no new criticals", () => {
    expect(shouldAlert(delta(-3), 0).alert).toBe(false);
    expect(shouldAlert(delta(5), 0).alert).toBe(false);
  });
});
