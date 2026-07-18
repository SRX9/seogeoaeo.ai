import { z } from "zod";
import {
  authorizeAction,
  isArticleGenerationBlockedByOwnerConstraint,
  type AuthorityRequest,
  type AuthorityResult,
} from "@/lib/agent/policy";
import type { PolicyCapability } from "@/lib/agent/policy-model";
import {
  buildKernelPlanReceipt,
  type KernelPlanReceipt,
} from "@/lib/agent/kernel-receipt";
import {
  AGENT_TOOLS,
  getAgentTool,
  type AgentToolDefinition,
  type ToolCaller,
  type ToolEffect,
  type ToolRiskClass,
} from "@/lib/agent/tool-registry";

export const ACTION_PLANNER_VERSION = "candidate-planner-v1";
export const MAX_ACTION_CANDIDATES = 8;

export const actionFamilySchema = z.enum([
  "observe",
  "research",
  "prepare",
  "publish",
  "repair",
]);

const graphIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/);

export const actionStopConditionSchema = z
  .object({
    code: z.enum([
      "objective_reached",
      "budget_exhausted",
      "evidence_stale",
      "owner_interrupt",
      "dependency_changed",
      "tool_failure",
    ]),
    description: z.string().min(1).max(240),
  })
  .strict();

export const expectedImpactSchema = z
  .object({
    metric: z.string().min(1).max(120),
    unit: z.string().min(1).max(40),
    direction: z.enum(["increase", "decrease"]),
    low: z.number().finite(),
    high: z.number().finite(),
    horizonHours: z.number().positive().max(24 * 366),
    /** Comparable 0..1 value supplied by the objective-specific impact model. */
    normalizedValue: z.number().min(0).max(1),
  })
  .strict()
  .refine((value) => value.low <= value.high, {
    path: ["high"],
    message: "Expected impact high must be greater than or equal to low.",
  });

export const candidateActionProposalSchema = z
  .object({
    candidateId: graphIdSchema,
    objectiveId: z.string().min(1).max(120),
    family: actionFamilySchema,
    tool: z
      .object({
        name: z.string().min(1).max(120),
        version: z.string().min(1).max(40),
      })
      .strict(),
    resourceRef: z.string().min(1).max(500),
    input: z.unknown(),
    reason: z.string().min(1).max(500),
    expectedImpact: expectedImpactSchema,
    evidenceStrength: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    uncertainty: z
      .object({
        score: z.number().min(0).max(1),
        factors: z.array(z.string().min(1).max(200)).max(8),
      })
      .strict(),
    evidenceRefs: z.array(z.string().min(1).max(500)).max(16),
    dependencyIds: z.array(graphIdSchema).max(8),
    stopConditions: z.array(actionStopConditionSchema).min(1).max(8),
    timeToValueHours: z.number().nonnegative().max(24 * 366),
    opportunityCost: z.number().min(0).max(1),
    learningValue: z.number().min(0).max(1),
    destination: z.string().min(1).max(120).nullable().optional(),
    categories: z.array(z.string().min(1).max(120)).max(12).optional(),
  })
  .strict();

export type ActionFamily = z.infer<typeof actionFamilySchema>;
export type CandidateActionProposal = z.infer<typeof candidateActionProposalSchema>;

export type CandidateCost = {
  credits: number;
  tokens: number;
  moneyMicros: number;
  latencyMs: number;
};

const candidateCostSchema = z
  .object({
    credits: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    moneyMicros: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
  })
  .strict();

export const plannerBudgetSchema = z
  .object({
    remainingCredits: z.number().int().nonnegative(),
    remainingTokens: z.number().int().nonnegative(),
    remainingMoneyMicros: z.number().int().nonnegative(),
    remainingTimeMs: z.number().int().nonnegative(),
    remainingRemoteWrites: z.number().int().nonnegative(),
  })
  .strict();

export type PlannerBudget = z.infer<typeof plannerBudgetSchema>;

export type CandidateDisposition =
  | "eligible"
  | "approval_required"
  | "blocked"
  | "rejected";

export type CandidateScoreBreakdown = {
  impact: number;
  evidence: number;
  confidence: number;
  reversibility: number;
  timeToValue: number;
  learning: number;
  cost: number;
  risk: number;
  uncertainty: number;
  opportunityCost: number;
};

export type CandidatePlanNode = Omit<CandidateActionProposal, "input"> & {
  input: unknown;
  capability: PolicyCapability | null;
  effect: ToolEffect;
  risk: ToolRiskClass;
  reversibility: AgentToolDefinition["rollback"]["mode"];
  estimatedCost: CandidateCost;
  score: number;
  scoreBreakdown: CandidateScoreBreakdown;
  authority: AuthorityResult;
  disposition: CandidateDisposition;
  rejectionReasons: string[];
};

export type CandidatePlanDiagnostic = {
  code:
    | "too_many_candidates"
    | "malformed_candidate"
    | "duplicate_candidate"
    | "cyclic_graph"
    | "unknown_tool"
    | "invalid_tool_input"
    | "invalid_budget"
    | "invalid_cost_estimate";
  candidateId?: string;
  message: string;
};

export type CandidatePlan = {
  plannerVersion: typeof ACTION_PLANNER_VERSION;
  objectiveId: string;
  receipt: KernelPlanReceipt;
  nodes: CandidatePlanNode[];
  edges: Array<{ from: string; to: string }>;
  selection:
    | { kind: "execute"; candidateId: string }
    | { kind: "request_approval"; candidateId: string }
    | null;
  diagnostics: CandidatePlanDiagnostic[];
};

type PlannerAuthority = Omit<
  AuthorityRequest,
  "capability" | "riskLevel" | "resourceRef" | "destination" | "categories"
>;

export type CandidatePlannerContext = {
  objectiveId: string;
  objectiveDefinitionVersion: number;
  proposals: readonly unknown[];
  budget: PlannerBudget;
  authority: PlannerAuthority;
  allowedToolNames?: readonly string[];
  /** Objective ceiling only; policy authorization is still evaluated separately. */
  allowedCapabilities?: readonly PolicyCapability[];
  availableToolNames?: readonly string[];
  satisfiedDependencyIds?: readonly string[];
  caller?: ToolCaller;
  minimumScore?: number;
  maxRisk?: ToolRiskClass;
  interruption?: { interrupted: boolean; reason?: string };
  getTool?: (name: string, version?: string) => AgentToolDefinition | undefined;
  authorize?: (request: AuthorityRequest) => AuthorityResult;
  resolveCapability?: (
    candidate: CandidateActionProposal,
    tool: AgentToolDefinition,
  ) => PolicyCapability | null;
  estimateCost?: (
    candidate: CandidateActionProposal,
    tool: AgentToolDefinition,
  ) => Partial<CandidateCost>;
  constraintEvaluator?: (
    candidate: CandidateActionProposal,
    tool: AgentToolDefinition,
  ) => string | null;
};

const TOOL_FAMILIES: Readonly<Record<string, ActionFamily>> = {
  "research.refresh": "research",
  "article.draft": "prepare",
  "visibility.audit.execute": "observe",
  "article.publish": "publish",
};

const RISK_VALUE: Record<ToolRiskClass, number> = {
  low: 0.1,
  medium: 0.35,
  high: 0.75,
  critical: 1,
};

const REVERSIBILITY_VALUE: Record<
  AgentToolDefinition["rollback"]["mode"],
  number
> = {
  supported: 1,
  not_applicable: 0.9,
  conditional: 0.5,
  none: 0,
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function ratio(cost: number, remaining: number) {
  if (cost <= 0) return 0;
  if (remaining <= 0) return 1;
  return clamp01(cost / remaining);
}

function estimateCandidateCost(
  candidate: CandidateActionProposal,
  tool: AgentToolDefinition,
  context: CandidatePlannerContext,
): CandidateCost {
  const dynamic = context.estimateCost?.(candidate, tool) ?? {};
  return {
    credits: Math.max(tool.estimatedCost.credits, dynamic.credits ?? 0),
    tokens: Math.max(0, dynamic.tokens ?? 0),
    moneyMicros: Math.max(0, dynamic.moneyMicros ?? 0),
    latencyMs: Math.max(
      tool.estimatedCost.latencyMs.upper,
      dynamic.latencyMs ?? 0,
    ),
  };
}

function scoreCandidate(
  candidate: CandidateActionProposal,
  tool: AgentToolDefinition,
  cost: CandidateCost,
  budget: PlannerBudget,
): { score: number; breakdown: CandidateScoreBreakdown } {
  const timeValue = clamp01(1 - candidate.timeToValueHours / (30 * 24));
  const costPressure = Math.max(
    ratio(cost.credits, budget.remainingCredits),
    ratio(cost.tokens, budget.remainingTokens),
    ratio(cost.moneyMicros, budget.remainingMoneyMicros),
    ratio(cost.latencyMs, budget.remainingTimeMs),
  );
  const breakdown: CandidateScoreBreakdown = {
    impact: candidate.expectedImpact.normalizedValue * 0.36,
    evidence: candidate.evidenceStrength * 0.14,
    confidence: candidate.confidence * 0.12,
    reversibility: REVERSIBILITY_VALUE[tool.rollback.mode] * 0.08,
    timeToValue: timeValue * 0.07,
    learning: candidate.learningValue * 0.06,
    cost: -costPressure * 0.07,
    risk: -RISK_VALUE[tool.riskClass] * 0.05,
    uncertainty: -candidate.uncertainty.score * 0.03,
    opportunityCost: -candidate.opportunityCost * 0.02,
  };
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return {
    score: Math.round(clamp01(total) * 10_000) / 100,
    breakdown,
  };
}

function hasGraphCycle(candidates: CandidateActionProposal[]) {
  const ids = new Set(candidates.map((candidate) => candidate.candidateId));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dependencies = new Map(
    candidates.map((candidate) => [
      candidate.candidateId,
      candidate.dependencyIds.filter((dependencyId) => ids.has(dependencyId)),
    ]),
  );

  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependencyId of dependencies.get(id) ?? []) {
      if (visit(dependencyId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }

  return candidates.some((candidate) => visit(candidate.candidateId));
}

function exceedsCost(cost: CandidateCost, budget: PlannerBudget, effect: ToolEffect) {
  const reasons: string[] = [];
  if (cost.credits > budget.remainingCredits) reasons.push("credit_budget_exceeded");
  if (cost.tokens > budget.remainingTokens) reasons.push("token_budget_exceeded");
  if (cost.moneyMicros > budget.remainingMoneyMicros) reasons.push("money_budget_exceeded");
  if (cost.latencyMs > budget.remainingTimeMs) reasons.push("time_budget_exceeded");
  if (effect === "remote_write" && budget.remainingRemoteWrites < 1) {
    reasons.push("remote_write_budget_exceeded");
  }
  return reasons;
}

function compareCandidates(left: CandidatePlanNode, right: CandidatePlanNode) {
  return (
    right.score - left.score ||
    RISK_VALUE[left.risk] - RISK_VALUE[right.risk] ||
    left.estimatedCost.credits - right.estimatedCost.credits ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

function emptyPlan(
  objectiveId: string,
  receipt: KernelPlanReceipt,
  diagnostics: CandidatePlanDiagnostic[],
): CandidatePlan {
  return {
    plannerVersion: ACTION_PLANNER_VERSION,
    objectiveId,
    receipt,
    nodes: [],
    edges: [],
    selection: null,
    diagnostics,
  };
}

/**
 * Validate, filter, and deterministically rank an objective-specific candidate
 * DAG. Tool metadata and policy decisions are always resolved server-side.
 */
export function planCandidateActions(context: CandidatePlannerContext): CandidatePlan {
  const receipt = buildKernelPlanReceipt({
    objectiveId: context.objectiveId,
    objectiveDefinitionVersion: context.objectiveDefinitionVersion,
    authority: context.authority,
  });
  const parsedBudget = plannerBudgetSchema.safeParse(context.budget);
  if (
    !parsedBudget.success ||
    !Number.isInteger(context.objectiveDefinitionVersion) ||
    context.objectiveDefinitionVersion < 1 ||
    !Number.isFinite(context.minimumScore ?? 0)
  ) {
    return emptyPlan(context.objectiveId, receipt, [
      {
        code: "invalid_budget",
        message: "Planner budgets and thresholds must be finite non-negative values.",
      },
    ]);
  }
  const budget = parsedBudget.data;
  if (context.proposals.length > MAX_ACTION_CANDIDATES) {
    return emptyPlan(context.objectiveId, receipt, [
      {
        code: "too_many_candidates",
        message: `Candidate sets are capped at ${MAX_ACTION_CANDIDATES}.`,
      },
    ]);
  }

  const diagnostics: CandidatePlanDiagnostic[] = [];
  const candidates: CandidateActionProposal[] = [];
  for (const raw of context.proposals) {
    const parsed = candidateActionProposalSchema.safeParse(raw);
    if (!parsed.success) {
      diagnostics.push({
        code: "malformed_candidate",
        message: "A candidate failed the strict planner schema.",
      });
      continue;
    }
    if (parsed.data.objectiveId !== context.objectiveId) {
      diagnostics.push({
        code: "malformed_candidate",
        candidateId: parsed.data.candidateId,
        message: "Candidate objective does not match the active objective.",
      });
      continue;
    }
    candidates.push(parsed.data);
  }

  const candidateIds = candidates.map((candidate) => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    return emptyPlan(context.objectiveId, receipt, [
      ...diagnostics,
      {
        code: "duplicate_candidate",
        message: "Candidate ids must be unique within a plan.",
      },
    ]);
  }
  if (hasGraphCycle(candidates)) {
    return emptyPlan(context.objectiveId, receipt, [
      ...diagnostics,
      { code: "cyclic_graph", message: "Candidate dependencies must form a DAG." },
    ]);
  }

  const getTool = context.getTool ?? getAgentTool;
  const authorize = context.authorize ?? authorizeAction;
  const caller = context.caller ?? "agent_loop";
  const allowedTools = new Set(
    context.allowedToolNames ?? AGENT_TOOLS.filter((tool) => tool.plannerEligible).map((tool) => tool.name),
  );
  const allowedCapabilities = new Set<PolicyCapability>(
    context.allowedCapabilities ?? ["observe", "prepare"],
  );
  const availableTools = new Set(
    context.availableToolNames ?? AGENT_TOOLS.map((tool) => tool.name),
  );
  const satisfiedDependencies = new Set(context.satisfiedDependencyIds ?? []);
  const minimumScore = Math.min(100, Math.max(0, context.minimumScore ?? 0));
  const maxRisk = context.maxRisk ?? "critical";
  const nodes: CandidatePlanNode[] = [];

  for (const candidate of candidates) {
    const tool = getTool(candidate.tool.name, candidate.tool.version);
    if (!tool) {
      diagnostics.push({
        code: "unknown_tool",
        candidateId: candidate.candidateId,
        message: "Candidate references an unknown tool or version.",
      });
      continue;
    }
    const parsedInput = tool.inputSchema.safeParse(candidate.input);
    if (!parsedInput.success) {
      diagnostics.push({
        code: "invalid_tool_input",
        candidateId: candidate.candidateId,
        message: "Candidate input does not match the registered tool schema.",
      });
      continue;
    }

    const rejectionReasons: string[] = [];
    if (!tool.plannerEligible) rejectionReasons.push("tool_not_planner_eligible");
    if (!tool.allowedCallers.includes(caller)) rejectionReasons.push("caller_not_allowed");
    if (!allowedTools.has(tool.name)) rejectionReasons.push("tool_not_relevant_to_objective");
    if (!availableTools.has(tool.name)) rejectionReasons.push("tool_unavailable");
    if (TOOL_FAMILIES[tool.name] && TOOL_FAMILIES[tool.name] !== candidate.family) {
      rejectionReasons.push("tool_family_mismatch");
    }
    if (RISK_VALUE[tool.riskClass] > RISK_VALUE[maxRisk]) {
      rejectionReasons.push("risk_exceeds_objective_limit");
    }
    if (context.interruption?.interrupted) rejectionReasons.push("owner_or_system_interrupted");

    const capability =
      tool.capability.mode === "static"
        ? tool.capability.value
        : context.resolveCapability?.(candidate, tool) ?? null;
    if (capability === null) rejectionReasons.push("capability_unresolved");
    else if (!allowedCapabilities.has(capability)) {
      rejectionReasons.push("capability_not_allowed_by_objective");
    }

    if (capability === "prepare") {
      const blockedInstruction = context.authority.ownerConstraints?.find((instruction) =>
        isArticleGenerationBlockedByOwnerConstraint(instruction, candidate.resourceRef),
      );
      if (blockedInstruction) rejectionReasons.push("blocked_by_owner_constraint");
    }
    const constraintReason = context.constraintEvaluator?.(candidate, tool);
    if (constraintReason) rejectionReasons.push(`constraint:${constraintReason}`);

    const cost = estimateCandidateCost(candidate, tool, context);
    const parsedCost = candidateCostSchema.safeParse(cost);
    if (!parsedCost.success) {
      diagnostics.push({
        code: "invalid_cost_estimate",
        candidateId: candidate.candidateId,
        message: "The server-side cost estimate is invalid.",
      });
      continue;
    }
    rejectionReasons.push(...exceedsCost(parsedCost.data, budget, tool.effect));
    const blockedDependencies = candidate.dependencyIds.filter(
      (dependencyId) => !satisfiedDependencies.has(dependencyId),
    );
    const { score, breakdown } = scoreCandidate(candidate, tool, parsedCost.data, budget);
    if (score < minimumScore) rejectionReasons.push("score_below_threshold");

    const authority = capability
      ? authorize({
          ...context.authority,
          capability,
          riskLevel: tool.riskClass,
          resourceRef: candidate.resourceRef,
          destination: candidate.destination,
          categories: candidate.categories,
        })
      : { decision: "deny" as const, reason: "Tool capability could not be resolved." };
    if (authority.decision === "deny") rejectionReasons.push("authority_denied");

    let disposition: CandidateDisposition = "eligible";
    if (rejectionReasons.length > 0) disposition = "rejected";
    else if (blockedDependencies.length > 0) disposition = "blocked";
    else if (authority.decision === "require_approval") disposition = "approval_required";

    nodes.push({
      ...candidate,
      input: parsedInput.data,
      capability,
      effect: tool.effect,
      risk: tool.riskClass,
      reversibility: tool.rollback.mode,
      estimatedCost: parsedCost.data,
      score,
      scoreBreakdown: breakdown,
      authority,
      disposition,
      rejectionReasons:
        disposition === "blocked"
          ? blockedDependencies.map((dependencyId) => `dependency:${dependencyId}`)
          : rejectionReasons,
    });
  }

  nodes.sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const executable = nodes.filter((node) => node.disposition === "eligible").sort(compareCandidates);
  const approvals = nodes
    .filter((node) => node.disposition === "approval_required")
    .sort(compareCandidates);
  const selected = executable[0] ?? approvals[0];
  const selection = selected
    ? {
        kind: selected.disposition === "eligible" ? ("execute" as const) : ("request_approval" as const),
        candidateId: selected.candidateId,
      }
    : null;
  const edges = candidates
    .flatMap((candidate) =>
      candidate.dependencyIds.map((dependencyId) => ({
        from: dependencyId,
        to: candidate.candidateId,
      })),
    )
    .sort((left, right) =>
      left.to.localeCompare(right.to) || left.from.localeCompare(right.from),
    );

  return {
    plannerVersion: ACTION_PLANNER_VERSION,
    objectiveId: context.objectiveId,
    receipt,
    nodes,
    edges,
    selection,
    diagnostics,
  };
}

export function getSelectedCandidate(plan: CandidatePlan) {
  if (!plan.selection) return null;
  return plan.nodes.find((node) => node.candidateId === plan.selection?.candidateId) ?? null;
}
