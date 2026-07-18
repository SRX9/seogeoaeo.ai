import { describe, expect, it } from "vitest";
import {
  evaluateStrategyLearning,
  PRODUCTION_WEIGHT_BOUNDS,
  selectControlledCandidate,
  type LearningObservation,
} from "./learning";

function observations(count: number, options?: { confounded?: boolean; holdout?: boolean }) {
  return Array.from({ length: count }, (_, index): LearningObservation => {
    const isHoldout = options?.holdout === true && index >= count / 2;
    return {
      id: `attribution:${index}`,
      actionId: `action:${index}`,
      attributionLevel: "query",
      outcomeValue: isHoldout ? 102 : 120,
      baselineValue: 100,
      verified: true,
      confounders: options?.confounded
        ? [
            {
              kind: "competing_action",
              severity: "high",
              evidenceRef: `event:${index}`,
            },
          ]
        : [],
      holdoutGroup: options?.holdout
        ? `${isHoldout ? "holdout" : "treatment"}:experiment-a`
        : null,
      evidenceRefs: [`checkpoint:${index}`],
    };
  });
}

function evaluate(items: LearningObservation[], currentWeight = 1) {
  return evaluateStrategyLearning({
    actionFamily: "research.refresh",
    strategyKey: "source:gsc",
    outcomeKind: "qualified_clicks",
    direction: "increase",
    attributionLevel: "query",
    currentWeight,
    observations: items,
  });
}

describe("bounded outcome learning", () => {
  it("changes strategy only after causal gates and bounds controlled exploration", () => {
    const eligible = evaluate(observations(20, { holdout: true }));
    expect(eligible).toMatchObject({
      status: "eligible",
      productionChange: true,
      sampleSize: 20,
      experimentalDesign: "holdout",
    });
    expect(eligible.candidateWeight).toBeGreaterThan(1);
    expect(eligible.candidateWeight).toBeLessThanOrEqual(PRODUCTION_WEIGHT_BOUNDS.max);

    const underThreshold = evaluate(observations(19));
    expect(underThreshold).toMatchObject({
      status: "insufficient_evidence",
      productionChange: false,
      candidateWeight: 1,
    });
    const confounded = evaluate(observations(20, { confounded: true }));
    expect(confounded).toMatchObject({
      status: "blocked_by_confounders",
      productionChange: false,
      candidateWeight: 1,
    });
    const bounded = evaluate(
      observations(20).map((item) => ({ ...item, outcomeValue: 10_000, baselineValue: 1 })),
      PRODUCTION_WEIGHT_BOUNDS.max,
    );
    expect(bounded.candidateWeight).toBe(PRODUCTION_WEIGHT_BOUNDS.max);

    const candidates = [
      {
        id: "allowed-best",
        baseScore: 80,
        productionWeight: 1,
      },
      {
        id: "allowed-alternative",
        baseScore: 70,
        productionWeight: 1,
      },
    ];
    expect(
      selectControlledCandidate(candidates, {
        seed: "exploit",
        explorationRate: 0,
      })?.candidate.id,
    ).toBe("allowed-best");
    const explored = Array.from({ length: 100 }, (_, index) =>
      selectControlledCandidate(candidates, {
        seed: `experiment:${index}`,
        explorationRate: 0.2,
      }),
    ).find((selection) => selection?.mode === "explore");
    expect(explored?.candidate.id).toBe("allowed-alternative");
  });
});
