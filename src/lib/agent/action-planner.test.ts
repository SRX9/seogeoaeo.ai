import { describe, expect, it } from "vitest";
import {
  MAX_ACTION_CANDIDATES,
  planCandidateActions,
  type ActionFamily,
  type CandidateActionProposal,
  type CandidatePlannerContext,
} from "@/lib/agent/action-planner";

const OBJECTIVE_ID = "objective:visibility";
const ID = "11111111-1111-4111-8111-111111111111";

function candidate(
  candidateId: string,
  family: ActionFamily,
  toolName: string,
  input: unknown,
  impact: number,
): CandidateActionProposal {
  return {
    candidateId,
    objectiveId: OBJECTIVE_ID,
    family,
    tool: { name: toolName, version: "1.0.0" },
    resourceRef: `${family}:${candidateId}`,
    input,
    reason: `Use ${toolName} for the objective.`,
    expectedImpact: {
      metric: "qualified visibility",
      unit: "points",
      direction: "increase",
      low: 1,
      high: 3,
      horizonHours: 168,
      normalizedValue: impact,
    },
    evidenceStrength: 0.8,
    confidence: 0.75,
    uncertainty: { score: 0.2, factors: ["Search demand can change."] },
    evidenceRefs: [`evidence:${candidateId}`],
    dependencyIds: [],
    stopConditions: [
      { code: "objective_reached", description: "Stop when the objective is reached." },
    ],
    timeToValueHours: 24,
    opportunityCost: 0.1,
    learningValue: 0.5,
  };
}

const baseContext: Omit<CandidatePlannerContext, "proposals"> = {
  objectiveId: OBJECTIVE_ID,
  objectiveDefinitionVersion: 1,
  budget: {
    remainingCredits: 80,
    remainingTokens: 10_000,
    remainingMoneyMicros: 1_000_000,
    remainingTimeMs: 600_000,
    remainingRemoteWrites: 0,
  },
  authority: { mode: "FULL_AUTO" },
  availableToolNames: ["research.refresh", "article.draft"],
  maxRisk: "low",
};

describe("candidate action planner", () => {
  it("fails closed, filters bounded candidates, and ranks eligible work deterministically", () => {
    const proposals: unknown[] = [
      candidate("research", "research", "research.refresh", { budget: 2 }, 0.6),
      candidate("draft", "prepare", "article.draft", { topicId: ID }, 0.95),
      candidate(
        "audit",
        "observe",
        "visibility.audit.execute",
        { auditId: ID, siteUrl: "https://example.com" },
        0.8,
      ),
      candidate(
        "publish",
        "publish",
        "article.publish",
        { articleId: ID, provider: "wordpress" },
        1,
      ),
      { candidateId: "malformed", objectiveId: OBJECTIVE_ID },
      {
        ...candidate("forged", "research", "research.refresh", { budget: 1 }, 1),
        authority: { decision: "allow" },
      },
    ];

    const plan = planCandidateActions({ ...baseContext, proposals });
    const reversed = planCandidateActions({ ...baseContext, proposals: [...proposals].reverse() });
    expect(plan.selection).toEqual({ kind: "execute", candidateId: "research" });
    expect(reversed.selection).toEqual(plan.selection);
    expect(reversed.nodes.map(({ candidateId, score }) => ({ candidateId, score }))).toEqual(
      plan.nodes.map(({ candidateId, score }) => ({ candidateId, score })),
    );
    expect(plan.nodes).toHaveLength(4);
    expect(plan.nodes.find((node) => node.candidateId === "draft")?.rejectionReasons).toContain(
      "credit_budget_exceeded",
    );
    expect(plan.nodes.find((node) => node.candidateId === "audit")?.rejectionReasons).toContain(
      "tool_unavailable",
    );
    expect(plan.nodes.find((node) => node.candidateId === "publish")?.rejectionReasons).toContain(
      "tool_not_planner_eligible",
    );
    expect(plan.diagnostics.filter((item) => item.code === "malformed_candidate")).toHaveLength(2);

    const policyDenied = planCandidateActions({
      ...baseContext,
      proposals: [proposals[0]],
      authorize: () => ({ decision: "deny", reason: "Deterministic policy denied it." }),
    });
    expect(policyDenied.selection).toBeNull();
    expect(policyDenied.nodes[0]?.rejectionReasons).toContain("authority_denied");

    const overLimit = planCandidateActions({
      ...baseContext,
      proposals: Array.from({ length: MAX_ACTION_CANDIDATES + 1 }, (_, index) =>
        candidate(`candidate-${index}`, "research", "research.refresh", { budget: 1 }, 0.5),
      ),
    });
    expect(overLimit.nodes).toEqual([]);
    expect(overLimit.diagnostics[0]?.code).toBe("too_many_candidates");
  });
});
