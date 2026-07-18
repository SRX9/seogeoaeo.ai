import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  getSelectedCandidate,
  planCandidateActions,
  type ActionFamily,
  type CandidateActionProposal,
  type CandidatePlan,
} from "../../src/lib/agent/action-planner";
import { agentEscalationSchema } from "../../src/lib/agent/escalation";
import {
  beginKernelIteration,
  createKernelState,
  observeKernelIteration,
  type KernelDecision,
} from "../../src/lib/agent/kernel";
import fixtureJson from "./scenarios/kernel-v1.json";

const fixtureSchema = z
  .object({
    version: z.literal("claudia-kernel-eval-v1"),
    threshold: z.number().min(0).max(1),
    scenarios: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.enum([
            "selection",
            "budget",
            "interrupt",
            "replan",
            "conflicting_objective",
            "malformed",
            "policy_denied",
          ]),
          remainingCredits: z.number().int().nonnegative(),
          availableTools: z.array(z.string()),
          impacts: z.object({
            research: z.number().min(0).max(1),
            draft: z.number().min(0).max(1),
            audit: z.number().min(0).max(1),
          }),
          expected: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .parse(fixtureJson);

const OBJECTIVE_ID = "objective:kernel-eval";
const UUID = "11111111-1111-4111-8111-111111111111";

function proposal(
  candidateId: "research" | "draft" | "audit",
  objectiveId: string,
  impact: number,
): CandidateActionProposal {
  const tools: Record<
    typeof candidateId,
    { family: ActionFamily; name: string; input: unknown }
  > = {
    research: {
      family: "research",
      name: "research.refresh",
      input: { budget: 2 },
    },
    draft: {
      family: "prepare",
      name: "article.draft",
      input: { topicId: UUID },
    },
    audit: {
      family: "observe",
      name: "visibility.audit.execute",
      input: { auditId: UUID, siteUrl: "https://example.com" },
    },
  };
  const tool = tools[candidateId];
  return {
    candidateId,
    objectiveId,
    family: tool.family,
    tool: { name: tool.name, version: "1.0.0" },
    resourceRef: `${candidateId}:${UUID}`,
    input: tool.input,
    reason: `Grounded ${candidateId} candidate for the active objective.`,
    expectedImpact: {
      metric: "objective metric",
      unit: "points",
      direction: "increase",
      low: 1,
      high: 3,
      horizonHours: 24 * 90,
      normalizedValue: impact,
    },
    evidenceStrength: 0.8,
    confidence: 0.75,
    uncertainty: { score: 0.2, factors: ["Outcome timing varies."] },
    evidenceRefs: [`record:${candidateId}`],
    dependencyIds: [],
    stopConditions: [
      { code: "objective_reached", description: "Stop at the configured target." },
      { code: "owner_interrupt", description: "Stop when the owner interrupts." },
    ],
    timeToValueHours: 24,
    opportunityCost: 0.1,
    learningValue: 0.5,
  };
}

const limits = {
  maxIterations: 3,
  maxElapsedMs: 600_000,
  maxTokens: 10_000,
  maxCredits: 500,
  maxMoneyMicros: 1_000_000,
  maxRemoteWrites: 0,
  maxRecoveryAttempts: 1,
};

function executionBoundary(plan: CandidatePlan) {
  const selected = getSelectedCandidate(plan);
  if (!selected) return undefined;
  return {
    status: "authorized" as const,
    checkedAt: "2026-07-14T12:00:00.000Z",
    iteration: 1,
    candidateId: selected.candidateId,
    tool: selected.tool,
    receipt: plan.receipt,
  };
}

function label(decision: KernelDecision): string {
  if (decision.type === "execute") return `execute:${decision.action.candidateId}`;
  if (decision.type === "ask") return `ask:${decision.escalation.reason}`;
  if (decision.type === "stop") return `stop:${decision.outcome}`;
  return decision.type;
}

describe("Claudia goal-kernel eval", () => {
  it("meets the deterministic selection and escalation threshold", () => {
    let passed = 0;
    for (const scenario of fixtureSchema.scenarios) {
      const candidateObjective =
        scenario.kind === "conflicting_objective" ? "objective:other" : OBJECTIVE_ID;
      const rawProposals: unknown[] = (["research", "draft", "audit"] as const)
        .filter((id) => scenario.impacts[id] > 0)
        .map((id) => proposal(id, candidateObjective, scenario.impacts[id]));
      if (scenario.kind === "malformed") {
        rawProposals[0] = { ...rawProposals[0] as object, authority: { decision: "allow" } };
      }
      const plan = planCandidateActions({
        objectiveId: OBJECTIVE_ID,
        objectiveDefinitionVersion: 1,
        proposals: rawProposals,
        budget: {
          remainingCredits: scenario.remainingCredits,
          remainingTokens: 10_000,
          remainingMoneyMicros: 1_000_000,
          remainingTimeMs: 600_000,
          remainingRemoteWrites: 0,
        },
        authority: { mode: "FULL_AUTO" },
        availableToolNames: scenario.availableTools,
        allowedCapabilities: ["observe", "prepare"],
        authorize:
          scenario.kind === "policy_denied"
            ? () => ({ decision: "deny", reason: "Deterministic policy denied it." })
            : undefined,
      });

      let decision: KernelDecision;
      if (scenario.kind === "budget") {
        decision = beginKernelIteration(
          createKernelState({ ...limits, maxCredits: 10 }),
          plan,
          { elapsedMs: 0 },
        ).decision;
      } else if (scenario.kind === "interrupt") {
        decision = beginKernelIteration(createKernelState(limits), plan, {
          elapsedMs: 0,
          interruption: { owner: true, system: false, reason: "Owner paused." },
        }).decision;
      } else if (scenario.kind === "replan") {
        const started = beginKernelIteration(createKernelState(limits), plan, {
          elapsedMs: 0,
          execution: executionBoundary(plan),
        });
        decision = observeKernelIteration(started.state, {
          candidateId: "research",
          outcome: "succeeded",
          verified: true,
          actualCost: { credits: 20, tokens: 100, moneyMicros: 0, remoteWrites: 0 },
          elapsedMs: 100,
          sideEffect: "applied",
          evidenceChanged: true,
        }).decision;
      } else {
        decision = beginKernelIteration(createKernelState(limits), plan, {
          elapsedMs: 0,
          execution: executionBoundary(plan),
        }).decision;
      }

      if (decision.type === "ask") {
        expect(
          agentEscalationSchema.safeParse(decision.escalation).success,
          scenario.id,
        ).toBe(true);
      }
      expect(label(decision), scenario.id).toBe(scenario.expected);
      passed += 1;
    }
    expect(passed / fixtureSchema.scenarios.length).toBeGreaterThanOrEqual(
      fixtureSchema.threshold,
    );
  });
});
