import { describe, expect, it } from "vitest";
import {
  getSelectedCandidate,
  planCandidateActions,
  type CandidateActionProposal,
  type CandidatePlan,
} from "@/lib/agent/action-planner";
import { agentEscalationSchema } from "@/lib/agent/escalation";
import {
  beginKernelIteration,
  createKernelState,
  observeKernelIteration,
  type KernelLimits,
} from "@/lib/agent/kernel";

const candidate: CandidateActionProposal = {
  candidateId: "research",
  objectiveId: "objective:visibility",
  family: "research",
  tool: { name: "research.refresh", version: "1.0.0" },
  resourceRef: "brand:research",
  input: { budget: 2 },
  reason: "Refresh evidence before choosing content work.",
  expectedImpact: {
    metric: "qualified visibility",
    unit: "points",
    direction: "increase",
    low: 1,
    high: 2,
    horizonHours: 168,
    normalizedValue: 0.7,
  },
  evidenceStrength: 0.8,
  confidence: 0.75,
  uncertainty: { score: 0.2, factors: ["Demand may change."] },
  evidenceRefs: ["evidence:baseline"],
  dependencyIds: [],
  stopConditions: [
    { code: "objective_reached", description: "Stop when the target is reached." },
  ],
  timeToValueHours: 24,
  opportunityCost: 0.1,
  learningValue: 0.8,
};

const plan = planCandidateActions({
  objectiveId: candidate.objectiveId,
  objectiveDefinitionVersion: 1,
  proposals: [candidate],
  budget: {
    remainingCredits: 1_000,
    remainingTokens: 100_000,
    remainingMoneyMicros: 1_000_000,
    remainingTimeMs: 1_000_000,
    remainingRemoteWrites: 0,
  },
  authority: { mode: "FULL_AUTO" },
});

const limits: KernelLimits = {
  maxIterations: 3,
  maxElapsedMs: 1_000_000,
  maxTokens: 100_000,
  maxCredits: 1_000,
  maxMoneyMicros: 1_000_000,
  maxRemoteWrites: 0,
  maxRecoveryAttempts: 1,
};

function executionBoundary(planValue: CandidatePlan, iteration: number) {
  const selected = getSelectedCandidate(planValue);
  if (!selected) throw new Error("Test plan has no selected candidate");
  return {
    status: "authorized" as const,
    checkedAt: "2026-07-14T12:00:00.000Z",
    iteration,
    candidateId: selected.candidateId,
    tool: selected.tool,
    receipt: planValue.receipt,
  };
}

function observation(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: "research",
    outcome: "succeeded",
    verified: true,
    actualCost: { credits: 20, tokens: 50, moneyMicros: 0, remoteWrites: 0 },
    elapsedMs: 100,
    sideEffect: "applied",
    ...overrides,
  };
}

describe("bounded plan-act-observe kernel", () => {
  it("emits one tool per iteration and fails closed at every retry, budget, and interruption boundary", () => {
    const unvalidated = beginKernelIteration(createKernelState(limits), plan, {
      elapsedMs: 0,
    });
    expect(unvalidated.decision).toMatchObject({ type: "stop", outcome: "invalid" });

    const started = beginKernelIteration(createKernelState(limits), plan, {
      elapsedMs: 0,
      execution: executionBoundary(plan, 1),
    });
    expect(started.decision.type).toBe("execute");
    expect(started.state.status).toBe("awaiting_observation");
    expect("actions" in started.decision).toBe(false);

    const duplicateAct = beginKernelIteration(started.state, plan, { elapsedMs: 1 });
    expect(duplicateAct.decision).toMatchObject({ type: "stop", outcome: "invalid" });
    expect(duplicateAct.state.status).toBe("awaiting_observation");

    const replanned = observeKernelIteration(started.state, observation({ evidenceChanged: true }));
    expect(replanned.decision.type).toBe("replan");
    expect(replanned.state).toMatchObject({ status: "ready", usage: { iterations: 1, credits: 20 } });

    const retriedStart = beginKernelIteration(createKernelState(limits), plan, {
      elapsedMs: 0,
      execution: executionBoundary(plan, 1),
    });
    const retry = observeKernelIteration(
      retriedStart.state,
      observation({
        outcome: "transient_failure",
        verified: false,
        actualCost: { credits: 0, tokens: 0, moneyMicros: 0, remoteWrites: 0 },
        sideEffect: "none",
        safeToRetry: true,
      }),
      { execution: executionBoundary(plan, 2) },
    );
    expect(retry.decision).toMatchObject({ type: "retry", target: "act" });
    expect(retry.state.usage.iterations).toBe(2);
    if (retry.decision.type === "retry" && retry.decision.target === "act") {
      expect(retry.decision.action.candidateId).toBe("research");
    }

    const budget = beginKernelIteration(
      createKernelState({ ...limits, maxCredits: 10 }),
      plan,
      { elapsedMs: 0 },
    );
    expect(budget.decision.type).toBe("ask");
    if (budget.decision.type === "ask") {
      expect(budget.decision.escalation.reason).toBe("budget_exhausted");
      expect(agentEscalationSchema.safeParse(budget.decision.escalation).success).toBe(true);
      expect(budget.decision.escalation.choices.every((choice) => choice.consequence.length > 0)).toBe(true);
    }

    const interrupted = beginKernelIteration(createKernelState(limits), plan, {
      elapsedMs: 0,
      interruption: { owner: true, system: false, reason: "Owner paused automation." },
    });
    expect(interrupted.decision).toMatchObject({ type: "stop", outcome: "interrupted" });

    const unverifiedStart = beginKernelIteration(
      createKernelState({ ...limits, maxRecoveryAttempts: 0 }),
      plan,
      { elapsedMs: 0, execution: executionBoundary(plan, 1) },
    );
    const exhausted = observeKernelIteration(
      unverifiedStart.state,
      observation({ verified: false, sideEffect: "unknown" }),
    );
    expect(exhausted.decision.type).toBe("ask");
    if (exhausted.decision.type === "ask") {
      expect(exhausted.decision.escalation.reason).toBe("recovery_exhausted");
      expect(agentEscalationSchema.safeParse(exhausted.decision.escalation).success).toBe(true);
    }

    const stale = beginKernelIteration(createKernelState(limits), plan, {
      elapsedMs: 0,
      execution: { status: "stale", reason: "Objective definition advanced to v2." },
    });
    expect(stale.decision).toMatchObject({ type: "replan" });

    const retryStart = beginKernelIteration(createKernelState(limits), plan, {
      elapsedMs: 0,
      execution: executionBoundary(plan, 1),
    });
    const retryInterrupted = observeKernelIteration(
      retryStart.state,
      observation({
        outcome: "transient_failure",
        verified: false,
        actualCost: { credits: 0, tokens: 0, moneyMicros: 0, remoteWrites: 0 },
        sideEffect: "none",
        safeToRetry: true,
      }),
      { execution: { status: "interrupted", reason: "Owner paused before retry." } },
    );
    expect(retryInterrupted.decision).toMatchObject({
      type: "stop",
      outcome: "interrupted",
    });
  });
});
