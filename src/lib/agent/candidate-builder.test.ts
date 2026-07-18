import { describe, expect, it } from "vitest";
import {
  candidateActionProposalSchema,
  planCandidateActions,
} from "@/lib/agent/action-planner";
import {
  buildGroundedCandidates,
  candidateBuilderInputSchema,
  toPlannerProposals,
} from "@/lib/agent/candidate-builder";
import type { ObjectiveDefinition } from "@/lib/agent/objectives";
import { getAgentTool } from "@/lib/agent/tool-registry";

const OBJECTIVE_ID = "11111111-1111-4111-8111-111111111111";
const TOPIC_ID = "22222222-2222-4222-8222-222222222222";
const AUDIT_ID = "33333333-3333-4333-8333-333333333333";

function objective(metric: ObjectiveDefinition["metric"]): ObjectiveDefinition {
  const decreasing = metric === "critical_crawler_findings";
  return {
    objective: `Improve ${metric} from a measured baseline.`,
    metric,
    baseline: {
      value: decreasing ? 8 : metric === "ai_answer_share_percent" ? 10 : 20,
      observedAt: "2026-07-01T00:00:00.000Z",
      sourceRefs: ["metric_snapshot:00000000-0000-4000-8000-000000000001"],
    },
    target: { value: decreasing ? 1 : metric === "ai_answer_share_percent" ? 25 : 100 },
    horizon: {
      startAt: "2026-07-01T00:00:00.000Z",
      endAt: "2026-10-01T00:00:00.000Z",
    },
    priority: 80,
    budget: { maxCredits: 500, maxRemoteWrites: 0, maxCostCents: 0 },
    constraints: ["Do not publish without approval"],
    allowedCapabilities: ["observe", "prepare"],
    successCondition: "Reach the configured target.",
    stopCondition: "Stop at the configured horizon or budget.",
  };
}

const estimate = {
  observedAt: "2026-07-14T00:00:00.000Z",
  impactLow: 1,
  impactHigh: 3,
  normalizedImpact: 0.8,
  horizonHours: 720,
  evidenceStrength: 0.85,
  confidence: 0.75,
  uncertaintyScore: 0.2,
  uncertaintyFactors: ["Demand may change."],
  opportunityCost: 0.1,
  learningValue: 0.7,
};

const allEvidence = {
  research: {
    ...estimate,
    sourceRefs: ["coverage_snapshot:00000000-0000-4000-8000-000000000002"],
    coverageGap: 0.4,
    suggestedBudget: 2,
  },
  draft: {
    ...estimate,
    sourceRefs: ["topic_score:00000000-0000-4000-8000-000000000003"],
    topicId: TOPIC_ID,
    requiresResearchRefresh: true,
  },
  audit: {
    ...estimate,
    sourceRefs: ["audit_request:00000000-0000-4000-8000-000000000004"],
    auditId: AUDIT_ID,
    siteUrl: "https://example.com",
  },
};

describe("grounded candidate builder", () => {
  it("maps trusted evidence to deterministic metric-relevant candidates and omits missing facts", () => {
    const cases = [
      {
        metric: "ai_answer_share_percent" as const,
        evidence: allEvidence,
        tools: ["research.refresh", "article.draft", "visibility.audit.execute"],
        auditImpact: 0.48,
      },
      {
        metric: "qualified_non_brand_clicks" as const,
        evidence: allEvidence,
        tools: ["research.refresh", "article.draft", "visibility.audit.execute"],
        auditImpact: 0.4,
      },
      {
        metric: "critical_crawler_findings" as const,
        evidence: allEvidence,
        tools: ["visibility.audit.execute"],
        auditImpact: 0.8,
      },
      {
        metric: "grounded_pages_published" as const,
        evidence: allEvidence,
        tools: ["research.refresh", "article.draft"],
        auditImpact: null,
      },
      {
        metric: "ai_answer_share_percent" as const,
        evidence: { draft: allEvidence.draft, audit: allEvidence.audit },
        tools: ["visibility.audit.execute"],
        auditImpact: 0.48,
      },
    ];

    for (const example of cases) {
      const input = {
        objectiveId: OBJECTIVE_ID,
        objective: objective(example.metric),
        evidence: example.evidence,
      };
      const first = buildGroundedCandidates(input);
      const second = buildGroundedCandidates(input);
      expect(second).toEqual(first);
      expect(first.map((candidate) => candidate.proposal.tool.name)).toEqual(example.tools);
      expect(toPlannerProposals(first)).toEqual(first.map((candidate) => candidate.proposal));
      expect(first).toHaveLength(Math.min(3, example.tools.length));
      const planned = planCandidateActions({
        objectiveId: OBJECTIVE_ID,
        objectiveDefinitionVersion: 1,
        proposals: toPlannerProposals(first),
        budget: {
          remainingCredits: 500,
          remainingTokens: 100_000,
          remainingMoneyMicros: 1_000_000,
          remainingTimeMs: 1_000_000,
          remainingRemoteWrites: 0,
        },
        authority: { mode: "FULL_AUTO" },
        allowedCapabilities: input.objective.allowedCapabilities,
      });
      expect(planned.diagnostics).toEqual([]);
      expect(planned.nodes).toHaveLength(first.length);

      for (const built of first) {
        expect(candidateActionProposalSchema.safeParse(built.proposal).success).toBe(true);
        const registered = getAgentTool(built.proposal.tool.name, built.proposal.tool.version);
        expect(built.registeredCost).toEqual(registered?.estimatedCost);
        expect(built.registeredRisk).toBe(registered?.riskClass);
        expect(built.proposal.evidenceRefs.every((ref) => /^[a-z][a-z0-9_-]+:/.test(ref))).toBe(true);
        expect(JSON.stringify(built)).not.toMatch(/workspaceId|brandId|tenantId/);
      }

      const draft = first.find((item) => item.proposal.tool.name === "article.draft");
      if (draft) {
        expect(draft.proposal.dependencyIds).toEqual([`research:${OBJECTIVE_ID}`]);
        expect(draft.proposal.resourceRef).toBe(`topic:${TOPIC_ID}`);
      }
      const audit = first.find((item) => item.proposal.tool.name === "visibility.audit.execute");
      expect(audit?.proposal.expectedImpact.normalizedValue ?? null).toBe(example.auditImpact);
    }

    expect(
      buildGroundedCandidates({
        objectiveId: OBJECTIVE_ID,
        objective: objective("ai_answer_share_percent"),
        evidence: {},
      }),
    ).toEqual([]);
    expect(
      candidateBuilderInputSchema.safeParse({
        objectiveId: OBJECTIVE_ID,
        objective: objective("ai_answer_share_percent"),
        evidence: allEvidence,
        toolName: "article.publish",
        workspaceId: OBJECTIVE_ID,
      }).success,
    ).toBe(false);
  });
});
