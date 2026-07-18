import { describe, expect, it } from "vitest";
import {
  assessRolloutTransition,
  evaluateAutonomyPolicy,
  type AutonomyPolicyInput,
} from "@/lib/agent/autonomy-rollout";
import { assessCanarySummary } from "@/lib/agent/canary-validation";

type Rollout = NonNullable<AutonomyPolicyInput["rollout"]>;

function rollout(overrides: Partial<Rollout> = {}): Rollout {
  const now = Date.now();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    brandId: "33333333-3333-4333-8333-333333333333",
    capability: "article.meta.update",
    provider: "wordpress",
    certificationId: "44444444-4444-4444-8444-444444444444",
    releaseId: "55555555-5555-4555-8555-555555555555",
    cohortKey: "phase8-canary",
    cohortPercent: 100,
    autonomyLevel: 4,
    rolloutStage: 7,
    executionMode: "live",
    status: "active",
    revision: 1,
    strategyRef: "strategy:phase8-reviewed",
    riskBudget: {
      maxActionsPerUtcDay: 3,
      maxCreditsPerUtcDay: 100,
      maxMoneyMicrosPerUtcDay: 1_000_000,
      maxResourcesPerAction: 1,
      destinations: ["wordpress"],
      allowedUtcHours: Array.from({ length: 24 }, (_, hour) => hour),
    },
    stopConditions: {
      pauseOnAnyCriticalIncident: true,
      sloKeys: ["duplicate_side_effects", "rollback_success"],
      maxVerificationFailureRate: 0,
      maxRollbackFailureRate: 0.01,
      maxBusinessHarmPercent: 1,
    },
    minimumSampleSize: 30,
    observationWindowStartsAt: new Date(now - 60_000),
    observationWindowEndsAt: new Date(now + 60_000),
    owner: "agent-platform-oncall",
    activatedAt: new Date(now - 60_000),
    pausedAt: null,
    pauseReason: null,
    completedAt: null,
    createdAt: new Date(now - 60_000),
    updatedAt: new Date(now - 60_000),
    ...overrides,
  };
}

const action: AutonomyPolicyInput["action"] = {
  capability: "article.meta.update",
  effect: "remote_write",
  risk: "low",
  resourceRef: "wordpress:https://example.com:post:1",
  destination: "wordpress",
  proposalHash: "a".repeat(64),
  approvalValidated: false,
  certificationValidated: true,
  certificationId: "44444444-4444-4444-8444-444444444444",
  reversible: true,
  estimatedCredits: 0,
  estimatedMoneyMicros: 0,
  resourceCount: 1,
};

describe("Phase 8 staged autonomy", () => {
  it("fails closed, shadows real brands, and allows only bounded certified actions", () => {
    const now = new Date();
    expect(
      evaluateAutonomyPolicy({
        rollout: null,
        action,
        cohortBucket: null,
        releaseValidated: false,
        stopSignals: [],
        now,
      }).decision,
    ).toBe("deny");
    expect(
      evaluateAutonomyPolicy({
        rollout: rollout({ rolloutStage: 4, executionMode: "shadow" }),
        action,
        cohortBucket: 0,
        releaseValidated: true,
        stopSignals: [],
        now,
      }).decision,
    ).toBe("shadow");
    expect(
      evaluateAutonomyPolicy({
        rollout: rollout(),
        action,
        cohortBucket: 0,
        releaseValidated: true,
        stopSignals: [],
        now,
      }).decision,
    ).toBe("allow");
    expect(
      evaluateAutonomyPolicy({
        rollout: rollout(),
        action: { ...action, risk: "high" },
        cohortBucket: 0,
        releaseValidated: true,
        stopSignals: [],
        now,
      }).decision,
    ).toBe("approval_required");
    expect(
      evaluateAutonomyPolicy({
        rollout: rollout(),
        action,
        cohortBucket: 0,
        releaseValidated: true,
        stopSignals: [{ id: "incident-1", key: "cross_tenant_denials", severity: "critical" }],
        now,
      }).decision,
    ).toBe("pause");

    expect(
      assessRolloutTransition(rollout({ rolloutStage: 5, cohortPercent: 5 }), {
        status: "active",
        rolloutStage: 7,
        autonomyLevel: 4,
        cohortPercent: 15,
        executionMode: "live",
      }).allowed,
    ).toBe(false);
    expect(
      assessRolloutTransition(rollout({ rolloutStage: 7, cohortPercent: 5 }), {
        status: "active",
        rolloutStage: 7,
        autonomyLevel: 4,
        cohortPercent: 15,
        executionMode: "live",
      }).allowed,
    ).toBe(true);
    expect(
      assessRolloutTransition(
        rollout({
          status: "draft",
          rolloutStage: 1,
          autonomyLevel: 0,
          cohortPercent: 0,
          executionMode: "eval",
        }),
        {
          status: "active",
          rolloutStage: 2,
          autonomyLevel: 1,
          cohortPercent: 1,
          executionMode: "synthetic",
        },
      ).allowed,
    ).toBe(false);
  });

  it("requires adequate controlled evidence before reporting improvement", () => {
    const base = {
      metric: "qualified_organic_traffic",
      metricClass: "business_effect" as const,
      design: "holdout" as const,
      direction: "higher" as const,
      minimumSampleSize: 30,
      minimumImprovement: 0.01,
      nonInferiorityMargin: 0.01,
      harmThreshold: 0.02,
      confidenceLevel: 0.95 as const,
    };
    expect(
      assessCanarySummary({
        ...base,
        treatment: { n: 100, mean: 0.2, variance: 0.01 },
        control: { n: 100, mean: 0.1, variance: 0.01 },
      }).conclusion,
    ).toBe("improved");
    expect(
      assessCanarySummary({
        ...base,
        treatment: { n: 10, mean: 0.2, variance: 0.01 },
        control: { n: 10, mean: 0.1, variance: 0.01 },
      }).conclusion,
    ).toBe("insufficient_data");
    expect(
      assessCanarySummary({
        ...base,
        treatment: { n: 100, mean: 0.02, variance: 0.001 },
        control: { n: 100, mean: 0.2, variance: 0.001 },
      }).conclusion,
    ).toBe("harm_detected");
  });
});
