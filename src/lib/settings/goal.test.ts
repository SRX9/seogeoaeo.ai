import { describe, expect, it } from "vitest";
import type { AgentMissionView } from "@/lib/agent/types";
import { buildGoalDefinition, inferGoalId } from "@/lib/settings/goal";

const mission: AgentMissionView = {
  id: "mission-1",
  key: "primary",
  objective: "Grow qualified discovery and trusted visibility for Acme.",
  metric: null,
  baseline: null,
  target: null,
  horizon: null,
  budget: null,
  constraints: [],
  allowedCapabilities: ["observe", "prepare"],
  successCondition: null,
  stopCondition: null,
  priority: 100,
  status: "active",
  definitionVersion: 1,
  configurationStatus: "needs_configuration",
  progress: {
    status: "needs_configuration",
    currentValue: null,
    progressPercent: null,
    targetReached: false,
    measuredAt: null,
    recordRefs: [],
  },
  origin: "owner_selected",
};

describe("simple goal settings", () => {
  it("recognizes the onboarding goal without exposing objective machinery", () => {
    expect(inferGoalId(mission, "Acme")).toBe("discovery");
  });

  it("builds a safe, measurable AI-answer goal from a customer choice", () => {
    const definition = buildGoalDefinition({
      goalId: "ai_answers",
      brandName: "Acme",
      mission,
      measurement: {
        value: 32,
        observedAt: "2026-07-01T00:00:00.000Z",
        recordRefs: ["audit:audit-1"],
      },
      now: new Date("2026-07-18T00:00:00.000Z"),
    });

    expect(definition.metric).toBe("ai_answer_share_percent");
    expect(definition.baseline.value).toBe(32);
    expect(definition.target.value).toBe(42);
    expect(definition.allowedCapabilities).toContain("article.create");
    expect(definition.budget.maxRemoteWrites).toBe(0);
  });

  it("uses a decreasing target for website health", () => {
    const definition = buildGoalDefinition({
      goalId: "website_health",
      brandName: "Acme",
      mission,
      measurement: null,
      now: new Date("2026-07-18T00:00:00.000Z"),
    });

    expect(definition.metric).toBe("critical_crawler_findings");
    expect(definition.baseline.value).toBe(1);
    expect(definition.target.value).toBe(0);
    expect(definition.allowedCapabilities).toEqual(["observe", "prepare"]);
  });
});
