import { describe, expect, it } from "vitest";
import {
  evaluateObjectiveProgress,
  isCapabilityAllowedByObjective,
  objectiveDefinitionSchema,
  toAgentMissionView,
  type ObjectiveDefinition,
} from "@/lib/agent/objectives";

const increasingObjective: ObjectiveDefinition = {
  objective: "Increase eligible AI answer share from 12% to 25%.",
  metric: "ai_answer_share_percent",
  baseline: {
    value: 12,
    observedAt: "2026-07-01T00:00:00.000Z",
    sourceRefs: ["answers:weekly:2026-07-01"],
  },
  target: { value: 25 },
  horizon: {
    startAt: "2026-07-01T00:00:00.000Z",
    endAt: "2026-10-01T00:00:00.000Z",
  },
  priority: 80,
  budget: { maxCredits: 500, maxRemoteWrites: 0, maxCostCents: 0 },
  constraints: ["Do not publish without approval"],
  allowedCapabilities: ["observe", "prepare"],
  successCondition: "Eligible AI answer share is at least 25%.",
  stopCondition: "Stop when the horizon or credit budget is exhausted.",
};

describe("measurable objectives", () => {
  it.each([
    {
      definition: increasingObjective,
      current: 18.5,
      at: "2026-08-01T00:00:00.000Z",
      status: "in_progress",
      progress: 50,
    },
    {
      definition: {
        ...increasingObjective,
        metric: "critical_crawler_findings" as const,
        baseline: { ...increasingObjective.baseline, value: 6 },
        target: { value: 0 },
      },
      current: 2,
      at: "2026-08-01T00:00:00.000Z",
      status: "in_progress",
      progress: 67,
    },
    {
      definition: increasingObjective,
      current: 25,
      at: "2026-08-01T00:00:00.000Z",
      status: "succeeded",
      progress: 100,
    },
    {
      definition: increasingObjective,
      current: 18.5,
      at: "2026-10-02T00:00:00.000Z",
      status: "expired",
      progress: 50,
    },
  ])("evaluates bounded $status progress", ({ definition, current, at, status, progress }) => {
    const result = evaluateObjectiveProgress(
      definition,
      { value: current, observedAt: at },
      { at: new Date(at) },
    );
    expect(result).toMatchObject({ status, progressPercent: progress });
  });

  it("rejects unsafe or non-measurable definitions", () => {
    const invalid = [
      {
        ...increasingObjective,
        budget: { ...increasingObjective.budget, maxCredits: -1 },
      },
      {
        ...increasingObjective,
        allowedCapabilities: ["observe", "unknown.write"],
      },
      {
        ...increasingObjective,
        target: { value: 10 },
      },
    ];
    for (const definition of invalid) {
      expect(objectiveDefinitionSchema.safeParse(definition).success).toBe(false);
    }
  });

  it("keeps legacy missions usable but unconfigured and treats capabilities as a ceiling", () => {
    const now = new Date("2026-07-14T00:00:00.000Z");
    const view = toAgentMissionView({
      id: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000002",
      brandId: "00000000-0000-4000-8000-000000000003",
      key: "primary",
      objective: "Grow qualified discovery.",
      metric: null,
      baseline: null,
      target: null,
      successCondition: "Improve visibility.",
      horizon: "ongoing",
      horizonStartAt: null,
      horizonEndAt: null,
      priority: 100,
      budget: null,
      constraints: [],
      allowedCapabilities: ["observe", "prepare"],
      stopCondition: null,
      definitionVersion: 1,
      status: "active",
      origin: "system_created",
      createdAt: now,
      updatedAt: now,
    });

    expect(view.configurationStatus).toBe("needs_configuration");
    expect(view.progress.status).toBe("needs_configuration");
    expect(isCapabilityAllowedByObjective(view.allowedCapabilities, "article.create")).toBe(false);
  });
});
