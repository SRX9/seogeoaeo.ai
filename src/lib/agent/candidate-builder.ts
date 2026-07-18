import { z } from "zod";
import type {
  ActionFamily,
  CandidateActionProposal,
} from "@/lib/agent/action-planner";
import {
  OBJECTIVE_METRICS,
  objectiveDefinitionSchema,
  type ObjectiveDefinition,
} from "@/lib/agent/objectives";
import {
  articleDraftInputSchema,
  getAgentTool,
  researchRefreshInputSchema,
  visibilityAuditInputSchema,
  type AgentToolDefinition,
  type ToolRiskClass,
} from "@/lib/agent/tool-registry";

type PlannerToolName =
  | "research.refresh"
  | "article.draft"
  | "visibility.audit.execute";
type GroundedFamily = Extract<ActionFamily, "research" | "prepare" | "observe">;

export const trustedRecordRefSchema = z
  .string()
  .trim()
  .min(3)
  .max(200)
  .regex(
    /^[a-z][a-z0-9_-]{1,31}:[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
    "Evidence must reference a persisted record.",
  )
  .refine(
    (value) => !/^(?:workspace|brand|tenant):/i.test(value),
    "Tenant identifiers are trusted execution context, not candidate evidence.",
  );

const evidenceEstimateShape = {
  observedAt: z.string().datetime({ offset: true }),
  sourceRefs: z.array(trustedRecordRefSchema).min(1).max(8),
  impactLow: z.number().finite().nonnegative(),
  impactHigh: z.number().finite().nonnegative(),
  normalizedImpact: z.number().min(0).max(1),
  horizonHours: z.number().positive().max(24 * 366),
  evidenceStrength: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  uncertaintyScore: z.number().min(0).max(1),
  uncertaintyFactors: z.array(z.string().min(1).max(200)).max(8),
  opportunityCost: z.number().min(0).max(1),
  learningValue: z.number().min(0).max(1),
};

function withImpactRange<T extends z.ZodRawShape>(schema: z.ZodObject<T, "strict">) {
  return schema.refine(
    (value) =>
      typeof value.impactLow === "number" &&
      typeof value.impactHigh === "number" &&
      value.impactLow <= value.impactHigh,
    { path: ["impactHigh"], message: "Impact high must be at least impact low." },
  );
}

export const researchCandidateEvidenceSchema = withImpactRange(
  z
    .object({
      ...evidenceEstimateShape,
      coverageGap: z.number().min(0).max(1),
      suggestedBudget: researchRefreshInputSchema.shape.budget,
    })
    .strict(),
);

export const draftCandidateEvidenceSchema = withImpactRange(
  z
    .object({
      ...evidenceEstimateShape,
      topicId: articleDraftInputSchema.shape.topicId,
      requiresResearchRefresh: z.boolean(),
    })
    .strict(),
);

export const auditCandidateEvidenceSchema = withImpactRange(
  z
    .object({
      ...evidenceEstimateShape,
      auditId: visibilityAuditInputSchema.shape.auditId,
      siteUrl: visibilityAuditInputSchema.shape.siteUrl,
    })
    .strict(),
);

export const candidateBuilderInputSchema = z
  .object({
    objectiveId: z.string().uuid(),
    objective: objectiveDefinitionSchema,
    evidence: z
      .object({
        research: researchCandidateEvidenceSchema.optional(),
        draft: draftCandidateEvidenceSchema.optional(),
        audit: auditCandidateEvidenceSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    const horizonEnd = new Date(input.objective.horizon.endAt).getTime();
    const horizonHours =
      (horizonEnd - new Date(input.objective.horizon.startAt).getTime()) / 3_600_000;
    const evidence = [
      ["research", input.evidence.research],
      ["draft", input.evidence.draft],
      ["audit", input.evidence.audit],
    ] as const;
    for (const [family, item] of evidence) {
      if (!item) continue;
      if (new Date(item.observedAt).getTime() > horizonEnd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidence", family, "observedAt"],
          message: "Evidence cannot be observed after the objective horizon.",
        });
      }
      if (item.horizonHours > horizonHours) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidence", family, "horizonHours"],
          message: "Impact estimates cannot exceed the configured objective horizon.",
        });
      }
    }
  });

export type CandidateBuilderInput = z.infer<typeof candidateBuilderInputSchema>;

export type GroundedCandidate = {
  proposal: CandidateActionProposal;
  registeredCost: AgentToolDefinition["estimatedCost"];
  registeredRisk: ToolRiskClass;
};

export const METRIC_FAMILY_RELEVANCE = {
  ai_answer_share_percent: { research: 1, prepare: 0.9, observe: 0.6 },
  qualified_non_brand_clicks: { research: 1, prepare: 0.95, observe: 0.5 },
  critical_crawler_findings: { research: 0, prepare: 0, observe: 1 },
  grounded_pages_published: { research: 0.55, prepare: 1, observe: 0 },
} as const satisfies Record<
  ObjectiveDefinition["metric"],
  Record<GroundedFamily, number>
>;

type EvidenceEstimate = {
  observedAt: string;
  sourceRefs: string[];
  impactLow: number;
  impactHigh: number;
  normalizedImpact: number;
  horizonHours: number;
  evidenceStrength: number;
  confidence: number;
  uncertaintyScore: number;
  uncertaintyFactors: string[];
  opportunityCost: number;
  learningValue: number;
};

function requirePlannerTool(name: PlannerToolName): AgentToolDefinition {
  const tool = getAgentTool(name);
  if (!tool || !tool.plannerEligible || !tool.allowedCallers.includes("agent_loop")) {
    throw new Error(`Planner tool ${name} is unavailable or quarantined.`);
  }
  return tool;
}

function roundSix(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function uniqueRefs(values: readonly string[]) {
  return [...new Set(values)].sort().slice(0, 16);
}

function stopConditions(): CandidateActionProposal["stopConditions"] {
  return [
    {
      code: "objective_reached",
      description: "Stop when the configured objective success condition is reached.",
    },
    {
      code: "budget_exhausted",
      description: "Stop before the configured objective budget is exceeded.",
    },
    {
      code: "owner_interrupt",
      description: "Stop when the owner or a system safety control interrupts work.",
    },
  ];
}

function proposalFromEvidence(input: {
  objectiveId: string;
  objective: ObjectiveDefinition;
  family: GroundedFamily;
  candidateId: string;
  tool: AgentToolDefinition;
  resourceRef: string;
  toolInput: unknown;
  reason: string;
  evidence: EvidenceEstimate;
  dependencyIds?: string[];
}): CandidateActionProposal {
  const metric = OBJECTIVE_METRICS[input.objective.metric];
  const relevance = METRIC_FAMILY_RELEVANCE[input.objective.metric][input.family];
  return {
    candidateId: input.candidateId,
    objectiveId: input.objectiveId,
    family: input.family,
    tool: { name: input.tool.name, version: input.tool.version },
    resourceRef: input.resourceRef,
    input: input.toolInput,
    reason: input.reason,
    expectedImpact: {
      metric: input.objective.metric,
      unit: metric.unit,
      direction: metric.direction,
      low: input.evidence.impactLow,
      high: input.evidence.impactHigh,
      horizonHours: input.evidence.horizonHours,
      normalizedValue: roundSix(input.evidence.normalizedImpact * relevance),
    },
    evidenceStrength: input.evidence.evidenceStrength,
    confidence: input.evidence.confidence,
    uncertainty: {
      score: input.evidence.uncertaintyScore,
      factors: input.evidence.uncertaintyFactors,
    },
    evidenceRefs: uniqueRefs(input.evidence.sourceRefs),
    dependencyIds: input.dependencyIds ?? [],
    stopConditions: stopConditions(),
    timeToValueHours: input.evidence.horizonHours,
    opportunityCost: input.evidence.opportunityCost,
    learningValue: input.evidence.learningValue,
  };
}

function grounded(proposal: CandidateActionProposal, tool: AgentToolDefinition): GroundedCandidate {
  return {
    proposal,
    registeredCost: {
      credits: tool.estimatedCost.credits,
      latencyMs: { ...tool.estimatedCost.latencyMs },
    },
    registeredRisk: tool.riskClass,
  };
}

/**
 * Build a canonical, objective-relevant candidate set from trusted records.
 * Missing or zero-impact evidence omits that family; this function never
 * synthesizes topic, audit, tenant, or tool identifiers.
 */
export function buildGroundedCandidates(rawInput: unknown): GroundedCandidate[] {
  const input = candidateBuilderInputSchema.parse(rawInput);
  const output: GroundedCandidate[] = [];
  const metric = OBJECTIVE_METRICS[input.objective.metric];
  const canObserve = input.objective.allowedCapabilities.includes("observe");
  const canPrepare = input.objective.allowedCapabilities.includes("prepare");
  const researchCandidateId = `research:${input.objectiveId}`;

  const researchTool = requirePlannerTool("research.refresh");
  const researchEvidence = input.evidence.research;
  const researchRelevant =
    METRIC_FAMILY_RELEVANCE[input.objective.metric].research > 0 &&
    canObserve &&
    researchEvidence !== undefined &&
    researchEvidence.coverageGap > 0 &&
    researchEvidence.suggestedBudget > 0 &&
    researchEvidence.normalizedImpact > 0 &&
    researchTool.estimatedCost.credits <= input.objective.budget.maxCredits;
  if (researchRelevant && researchEvidence) {
    const toolInput = researchRefreshInputSchema.parse({
      budget: researchEvidence.suggestedBudget,
    });
    const proposal = proposalFromEvidence({
      objectiveId: input.objectiveId,
      objective: input.objective,
      family: "research",
      candidateId: researchCandidateId,
      tool: researchTool,
      resourceRef: `mission:${input.objectiveId}`,
      toolInput,
      reason: `Trusted coverage evidence shows a ${roundSix(
        researchEvidence.coverageGap * 100,
      )}% gap relevant to ${metric.label}.`,
      evidence: researchEvidence,
    });
    output.push(grounded(proposal, researchTool));
  }

  const draftTool = requirePlannerTool("article.draft");
  const draftEvidence = input.evidence.draft;
  const researchDependencySatisfied =
    !draftEvidence?.requiresResearchRefresh || output.some((item) => item.proposal.candidateId === researchCandidateId);
  const draftRelevant =
    METRIC_FAMILY_RELEVANCE[input.objective.metric].prepare > 0 &&
    canPrepare &&
    draftEvidence !== undefined &&
    draftEvidence.normalizedImpact > 0 &&
    researchDependencySatisfied &&
    draftTool.estimatedCost.credits <= input.objective.budget.maxCredits;
  if (draftRelevant && draftEvidence) {
    const toolInput = articleDraftInputSchema.parse({ topicId: draftEvidence.topicId });
    const topicRef = `topic:${draftEvidence.topicId}`;
    const proposal = proposalFromEvidence({
      objectiveId: input.objectiveId,
      objective: input.objective,
      family: "prepare",
      candidateId: `draft:${draftEvidence.topicId}`,
      tool: draftTool,
      resourceRef: topicRef,
      toolInput,
      reason: `Trusted topic record ${topicRef} has measurable expected impact on ${metric.label}.`,
      evidence: {
        ...draftEvidence,
        sourceRefs: uniqueRefs([...draftEvidence.sourceRefs, topicRef]),
      },
      dependencyIds: draftEvidence.requiresResearchRefresh ? [researchCandidateId] : [],
    });
    output.push(grounded(proposal, draftTool));
  }

  const auditTool = requirePlannerTool("visibility.audit.execute");
  const auditEvidence = input.evidence.audit;
  const auditRelevant =
    METRIC_FAMILY_RELEVANCE[input.objective.metric].observe > 0 &&
    canObserve &&
    auditEvidence !== undefined &&
    auditEvidence.normalizedImpact > 0 &&
    auditTool.estimatedCost.credits <= input.objective.budget.maxCredits;
  if (auditRelevant && auditEvidence) {
    const toolInput = visibilityAuditInputSchema.parse({
      auditId: auditEvidence.auditId,
      siteUrl: auditEvidence.siteUrl,
    });
    const auditRef = `audit:${auditEvidence.auditId}`;
    const proposal = proposalFromEvidence({
      objectiveId: input.objectiveId,
      objective: input.objective,
      family: "observe",
      candidateId: `audit:${auditEvidence.auditId}`,
      tool: auditTool,
      resourceRef: auditRef,
      toolInput,
      reason: `Trusted audit record ${auditRef} can measure progress on ${metric.label}.`,
      evidence: {
        ...auditEvidence,
        sourceRefs: uniqueRefs([...auditEvidence.sourceRefs, auditRef]),
      },
    });
    output.push(grounded(proposal, auditTool));
  }

  return output;
}

export function toPlannerProposals(
  candidates: readonly GroundedCandidate[],
): CandidateActionProposal[] {
  return candidates.map((candidate) => candidate.proposal);
}
