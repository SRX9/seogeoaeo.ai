import { describe, expect, it } from "vitest";
import { CREDIT_COSTS } from "./credits";
import { effectiveVisibilityCaps, plans, visibilityCapsForPlan } from "./plans";

describe("visibility credit costs", () => {
  it("declares every visibility action, cheaper than an article", () => {
    for (const key of ["visibility_audit", "answer_run", "competitor_benchmark", "pdf_report", "tool_run_basic", "tool_run_ai"] as const) {
      expect(CREDIT_COSTS[key]).toBeGreaterThan(0);
      expect(CREDIT_COSTS[key]).toBeLessThan(CREDIT_COSTS.article_generation);
    }
    // No per-fix key exists anywhere.
    expect((CREDIT_COSTS as Record<string, number>).fix_apply).toBeUndefined();
  });
});

describe("visibilityCapsForPlan", () => {
  it("gates cadence + counts per plan; unsubscribed gets nothing", () => {
    expect(visibilityCapsForPlan("scale").monitoringCadence).toBe("weekly");
    expect(visibilityCapsForPlan("indie").trackedPrompts).toBe(5);
    const free = visibilityCapsForPlan(null);
    expect(free.monitoringCadence).toBe("none");
    expect(free.autoFixCap).toBe(0);
  });

  it("caps scale monotonically above indie", () => {
    expect(plans.scale.visibility.autoFixCap).toBeGreaterThan(plans.indie.visibility.autoFixCap);
  });

  it("effectiveVisibilityCaps ignores planId when status is not active", () => {
    expect(effectiveVisibilityCaps({ status: "inactive", planId: "startup" }).pdfReports).toBe(
      false,
    );
    expect(effectiveVisibilityCaps({ status: "active", planId: "startup" }).pdfReports).toBe(true);
    expect(effectiveVisibilityCaps({ status: "canceled", planId: "scale" }).trackedPrompts).toBe(0);
  });
});
