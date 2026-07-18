import { z } from "zod";
import {
  getSelectedCandidate,
  type CandidateCost,
  type CandidatePlan,
  type CandidatePlanNode,
} from "@/lib/agent/action-planner";
import {
  defineAgentEscalation,
  type AgentEscalation,
  type AgentEscalationReason,
} from "@/lib/agent/escalation";
import type { KernelPlanReceipt } from "@/lib/agent/kernel-receipt";

export const AGENT_KERNEL_VERSION = "plan-act-observe-v1";

export const kernelLimitsSchema = z
  .object({
    maxIterations: z.number().int().min(1).max(32),
    maxElapsedMs: z.number().int().positive(),
    maxTokens: z.number().int().nonnegative(),
    maxCredits: z.number().int().nonnegative(),
    maxMoneyMicros: z.number().int().nonnegative(),
    maxRemoteWrites: z.number().int().nonnegative(),
    maxRecoveryAttempts: z.number().int().min(0).max(8),
  })
  .strict();

const actualCostSchema = z
  .object({
    credits: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
    moneyMicros: z.number().int().nonnegative(),
    remoteWrites: z.number().int().nonnegative().max(1),
  })
  .strict();

export const kernelObservationSchema = z
  .object({
    candidateId: z.string().min(1).max(80),
    outcome: z.enum([
      "succeeded",
      "no_work",
      "transient_failure",
      "permanent_failure",
    ]),
    verified: z.boolean(),
    actualCost: actualCostSchema,
    elapsedMs: z.number().int().nonnegative(),
    objectiveReached: z.boolean().optional(),
    evidenceChanged: z.boolean().optional(),
    sideEffect: z.enum(["none", "applied", "unknown"]),
    safeToRetry: z.boolean().optional(),
    rollbackAvailable: z.boolean().optional(),
    interruption: z
      .object({
        owner: z.boolean(),
        system: z.boolean(),
        reason: z.string().min(1).max(240).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type KernelLimits = z.infer<typeof kernelLimitsSchema>;
export type KernelObservation = z.infer<typeof kernelObservationSchema>;

export type KernelUsage = {
  iterations: number;
  elapsedMs: number;
  tokens: number;
  credits: number;
  moneyMicros: number;
  remoteWrites: number;
};

export type KernelAction = {
  candidateId: string;
  objectiveId: string;
  family: CandidatePlanNode["family"];
  tool: CandidatePlanNode["tool"];
  input: unknown;
  resourceRef: string;
  capability: NonNullable<CandidatePlanNode["capability"]>;
  effect: CandidatePlanNode["effect"];
  risk: CandidatePlanNode["risk"];
  estimatedCost: CandidateCost;
  evidenceRefs: CandidatePlanNode["evidenceRefs"];
  stopConditions: CandidatePlanNode["stopConditions"];
  destination: CandidatePlanNode["destination"];
  categories: CandidatePlanNode["categories"];
  receipt: KernelPlanReceipt;
};

/** Issued by the trusted server-side boundary resolver immediately before an act. */
export type KernelExecutionBoundary =
  | {
      status: "authorized";
      checkedAt: string;
      iteration: number;
      candidateId: string;
      tool: { name: string; version: string };
      receipt: KernelPlanReceipt;
    }
  | {
      status: "stale" | "denied" | "interrupted";
      reason: string;
    }
  | {
      status: "shadow";
      reason: string;
      decisionId: string;
    };

export type KernelState = {
  kernelVersion: typeof AGENT_KERNEL_VERSION;
  status: "ready" | "awaiting_observation" | "waiting" | "completed" | "stopped";
  limits: KernelLimits;
  usage: KernelUsage;
  recoveryAttempts: number;
  activeAction: KernelAction | null;
};

export type KernelInterruption = {
  owner: boolean;
  system: boolean;
  reason?: string;
};

export type KernelDecision =
  | { type: "execute"; action: KernelAction }
  | { type: "continue"; reason: string }
  | { type: "replan"; reason: string }
  | { type: "retry"; target: "act"; action: KernelAction; reason: string }
  | { type: "retry"; target: "observe"; candidateId: string; reason: string }
  | { type: "rollback"; candidateId: string; reason: string }
  | { type: "shadow"; candidateId: string; decisionId: string; reason: string }
  | { type: "ask"; escalation: AgentEscalation }
  | {
      type: "stop";
      outcome: "completed" | "bounded" | "interrupted" | "invalid" | "failed";
      reason: string;
    };

export type KernelTransition = {
  state: KernelState;
  decision: KernelDecision;
};

export function createKernelState(limits: KernelLimits): KernelState {
  return {
    kernelVersion: AGENT_KERNEL_VERSION,
    status: "ready",
    limits: kernelLimitsSchema.parse(limits),
    usage: {
      iterations: 0,
      elapsedMs: 0,
      tokens: 0,
      credits: 0,
      moneyMicros: 0,
      remoteWrites: 0,
    },
    recoveryAttempts: 0,
    activeAction: null,
  };
}

function toKernelAction(
  candidate: CandidatePlanNode,
  receipt: KernelPlanReceipt,
): KernelAction | null {
  if (candidate.capability === null) return null;
  return {
    candidateId: candidate.candidateId,
    objectiveId: candidate.objectiveId,
    family: candidate.family,
    tool: candidate.tool,
    input: candidate.input,
    resourceRef: candidate.resourceRef,
    capability: candidate.capability,
    effect: candidate.effect,
    risk: candidate.risk,
    estimatedCost: candidate.estimatedCost,
    evidenceRefs: candidate.evidenceRefs,
    stopConditions: candidate.stopConditions,
    destination: candidate.destination,
    categories: candidate.categories,
    receipt,
  };
}

function stopped(
  state: KernelState,
  outcome: Extract<KernelDecision, { type: "stop" }>["outcome"],
  reason: string,
): KernelTransition {
  return {
    state: { ...state, status: outcome === "completed" ? "completed" : "stopped", activeAction: null },
    decision: { type: "stop", outcome, reason },
  };
}

function interruptionTransition(
  state: KernelState,
  interruption?: KernelInterruption,
): KernelTransition | null {
  if (!interruption?.owner && !interruption?.system) return null;
  return stopped(
    state,
    "interrupted",
    interruption.reason ??
      (interruption.owner ? "The owner interrupted the task." : "A system safety control interrupted the task."),
  );
}

function sameReceipt(left: KernelPlanReceipt, right: KernelPlanReceipt): boolean {
  return (
    left.objectiveId === right.objectiveId &&
    left.objectiveDefinitionVersion === right.objectiveDefinitionVersion &&
    left.policyRevision === right.policyRevision &&
    left.registryRevision === right.registryRevision
  );
}

function executionBoundaryTransition(
  state: KernelState,
  action: KernelAction,
  boundary: KernelExecutionBoundary | undefined,
  iteration: number,
): KernelTransition | null {
  if (!boundary) {
    return stopped(
      state,
      "invalid",
      "A fresh server-side execution boundary is required before any tool call or retry.",
    );
  }
  if (boundary.status === "interrupted") {
    return stopped(state, "interrupted", boundary.reason);
  }
  if (boundary.status === "shadow") {
    return {
      state: { ...state, status: "waiting", activeAction: null },
      decision: {
        type: "shadow",
        candidateId: action.candidateId,
        decisionId: boundary.decisionId,
        reason: boundary.reason,
      },
    };
  }
  if (boundary.status === "stale" || boundary.status === "denied") {
    return {
      state: { ...state, status: "ready", activeAction: null },
      decision: { type: "replan", reason: boundary.reason },
    };
  }
  if (boundary.status !== "authorized") {
    return stopped(state, "invalid", "The execution boundary status is invalid.");
  }
  if (
    !Number.isFinite(Date.parse(boundary.checkedAt)) ||
    boundary.iteration !== iteration ||
    boundary.candidateId !== action.candidateId ||
    boundary.tool.name !== action.tool.name ||
    boundary.tool.version !== action.tool.version ||
    !sameReceipt(boundary.receipt, action.receipt)
  ) {
    return {
      state: { ...state, status: "ready", activeAction: null },
      decision: {
        type: "replan",
        reason: "The execution authorization does not match the current action and iteration.",
      },
    };
  }
  return null;
}

function makeApprovalEscalation(candidate: CandidatePlanNode) {
  return defineAgentEscalation({
    kind: "approval",
    reason:
      candidate.reversibility === "none" ? "irreversible_action" : "authority_exceeded",
    question: `Should Claudia run ${candidate.tool.name} for this objective?`,
    known: [
      `The candidate targets ${candidate.expectedImpact.metric} with an expected range of ${candidate.expectedImpact.low} to ${candidate.expectedImpact.high} ${candidate.expectedImpact.unit}.`,
      `The registered risk is ${candidate.risk} and the estimated cost is ${candidate.estimatedCost.credits} credits.`,
    ],
    uncertain: [candidate.authority.reason],
    choices: [
      {
        id: "approve_action",
        label: "Approve action",
        consequence: "The exact proposal may execute after policy, budget, and owner controls are revalidated.",
      },
      {
        id: "reject_action",
        label: "Reject action",
        consequence: "This candidate will not execute and Claudia will replan or stop the task.",
      },
    ],
    recommendedChoiceId: null,
    evidenceRefs: candidate.evidenceRefs,
  });
}

function makeBudgetEscalation(candidate?: CandidatePlanNode) {
  const known = candidate
    ? [
        `${candidate.tool.name} is the selected action.`,
        `It is estimated to require ${candidate.estimatedCost.credits} credits and ${candidate.estimatedCost.latencyMs} ms at the registered upper latency bound.`,
      ]
    : ["The task reached one of its configured execution bounds."];
  return defineAgentEscalation({
    kind: "clarification",
    reason: "budget_exhausted",
    question: "Should this task resume after its budget changes, or stop here?",
    known,
    uncertain: ["No further action can run inside the current bounded execution."],
    choices: [
      {
        id: "resume_with_budget",
        label: "Resume with budget",
        consequence: "A new bounded run may start after the owner changes or replenishes the applicable budget.",
      },
      {
        id: "stop_task",
        label: "Stop task",
        consequence: "The task ends without another tool call.",
      },
    ],
    recommendedChoiceId: "stop_task",
    evidenceRefs: candidate?.evidenceRefs ?? [],
  });
}

function makeNoActionEscalation(plan: CandidatePlan) {
  const lowValue = plan.nodes.some((node) =>
    node.rejectionReasons.includes("score_below_threshold"),
  );
  const reason: AgentEscalationReason = lowValue
    ? "low_value_for_cost"
    : plan.nodes.length === 0
      ? "insufficient_evidence"
      : "no_viable_action";
  return defineAgentEscalation({
    kind: "clarification",
    reason,
    question: "What should Claudia do when no candidate is currently safe and executable?",
    known: [
      `${plan.nodes.length} validated candidate${plan.nodes.length === 1 ? " is" : "s are"} in the current plan.`,
    ],
    uncertain: ["More evidence or a changed constraint may produce a safe executable action."],
    choices: [
      {
        id: "provide_context",
        label: "Provide context",
        consequence: "The owner can add evidence or constraints, then Claudia will create a fresh candidate plan.",
      },
      {
        id: "stop_task",
        label: "Stop task",
        consequence: "The task ends without executing a tool.",
      },
    ],
    recommendedChoiceId: "provide_context",
    evidenceRefs: plan.nodes.flatMap((node) => node.evidenceRefs).slice(0, 16),
  });
}

function makeRecoveryEscalation(action: KernelAction, unknownSideEffect = false) {
  return defineAgentEscalation({
    kind: "clarification",
    reason: "recovery_exhausted",
    question: `How should Claudia resolve the failed ${action.tool.name} action?`,
    known: [
      `The bounded recovery allowance for ${action.candidateId} is exhausted or unsafe to use.`,
    ],
    uncertain: [
      unknownSideEffect
        ? "The remote or local side effect cannot be proven absent, so the action will not be retried blindly."
        : "Another attempt may repeat the same failure without producing a verified result.",
    ],
    choices: [
      {
        id: "review_and_resume",
        label: "Review and resume",
        consequence: "The owner reviews the failure before a new bounded run is allowed.",
      },
      {
        id: "stop_task",
        label: "Stop task",
        consequence: "No additional action or retry will run.",
      },
    ],
    recommendedChoiceId: "stop_task",
    evidenceRefs: [],
  });
}

function actionExceedsRemaining(state: KernelState, action: KernelAction) {
  return (
    state.usage.credits + action.estimatedCost.credits > state.limits.maxCredits ||
    state.usage.tokens + action.estimatedCost.tokens > state.limits.maxTokens ||
    state.usage.moneyMicros + action.estimatedCost.moneyMicros >
      state.limits.maxMoneyMicros ||
    state.usage.elapsedMs + action.estimatedCost.latencyMs > state.limits.maxElapsedMs ||
    (action.effect === "remote_write" &&
      state.usage.remoteWrites + 1 > state.limits.maxRemoteWrites)
  );
}

function usageExceedsLimits(state: KernelState) {
  return (
    state.usage.credits > state.limits.maxCredits ||
    state.usage.tokens > state.limits.maxTokens ||
    state.usage.moneyMicros > state.limits.maxMoneyMicros ||
    state.usage.elapsedMs >= state.limits.maxElapsedMs ||
    state.usage.remoteWrites > state.limits.maxRemoteWrites
  );
}

/** Select at most one registered tool action for the next bounded iteration. */
export function beginKernelIteration(
  state: KernelState,
  plan: CandidatePlan,
  boundary: {
    elapsedMs: number;
    interruption?: KernelInterruption;
    execution?: KernelExecutionBoundary;
  },
): KernelTransition {
  if (!Number.isInteger(boundary.elapsedMs) || boundary.elapsedMs < 0) {
    return stopped(state, "invalid", "Elapsed time must be a non-negative integer.");
  }
  if (state.status !== "ready") {
    return {
      state,
      decision: {
        type: "stop",
        outcome: "invalid",
        reason:
          state.status === "awaiting_observation"
            ? "The active action must be observed before another tool can run."
            : `The kernel is already ${state.status}.`,
      },
    };
  }
  const interrupted = interruptionTransition(state, boundary.interruption);
  if (interrupted) return interrupted;
  if (state.usage.iterations >= state.limits.maxIterations) {
    return stopped(state, "bounded", "The iteration limit was reached.");
  }
  if (boundary.elapsedMs >= state.limits.maxElapsedMs) {
    return stopped(
      { ...state, usage: { ...state.usage, elapsedMs: boundary.elapsedMs } },
      "bounded",
      "The elapsed-time limit was reached.",
    );
  }

  const selected = getSelectedCandidate(plan);
  const nextUsage = {
    ...state.usage,
    iterations: state.usage.iterations + 1,
    elapsedMs: Math.max(state.usage.elapsedMs, boundary.elapsedMs),
  };
  if (!plan.selection || !selected) {
    return {
      state: { ...state, status: "waiting", usage: nextUsage },
      decision: { type: "ask", escalation: makeNoActionEscalation(plan) },
    };
  }
  if (plan.selection.kind === "request_approval") {
    if (selected.disposition !== "approval_required") {
      return stopped(state, "invalid", "The approval selection is not approval-bound.");
    }
    return {
      state: { ...state, status: "waiting", usage: nextUsage },
      decision: { type: "ask", escalation: makeApprovalEscalation(selected) },
    };
  }
  if (selected.disposition !== "eligible") {
    return stopped(state, "invalid", "The selected candidate is not executable.");
  }

  const action = toKernelAction(selected, plan.receipt);
  if (!action) {
    return stopped(state, "invalid", "The selected tool capability is unresolved.");
  }
  const reservedState = { ...state, usage: nextUsage };
  if (actionExceedsRemaining(reservedState, action)) {
    return {
      state: { ...reservedState, status: "waiting" },
      decision: { type: "ask", escalation: makeBudgetEscalation(selected) },
    };
  }
  const boundaryTransition = executionBoundaryTransition(
    reservedState,
    action,
    boundary.execution,
    nextUsage.iterations,
  );
  if (boundaryTransition) return boundaryTransition;
  return {
    state: { ...reservedState, status: "awaiting_observation", activeAction: action },
    decision: { type: "execute", action },
  };
}

/** Record/verify the one active action, then choose the next bounded transition. */
export function observeKernelIteration(
  state: KernelState,
  rawObservation: unknown,
  boundary: {
    interruption?: KernelInterruption;
    execution?: KernelExecutionBoundary;
  } = {},
): KernelTransition {
  if (state.status !== "awaiting_observation" || !state.activeAction) {
    return stopped(state, "invalid", "There is no active action to observe.");
  }
  const parsed = kernelObservationSchema.safeParse(rawObservation);
  if (!parsed.success) {
    return stopped(state, "invalid", "The tool observation failed the strict schema.");
  }
  const observation = parsed.data;
  const action = state.activeAction;
  if (observation.candidateId !== action.candidateId) {
    return stopped(state, "invalid", "The observation does not match the active action.");
  }

  const observedState: KernelState = {
    ...state,
    usage: {
      ...state.usage,
      elapsedMs: Math.max(state.usage.elapsedMs, observation.elapsedMs),
      credits: state.usage.credits + observation.actualCost.credits,
      tokens: state.usage.tokens + observation.actualCost.tokens,
      moneyMicros: state.usage.moneyMicros + observation.actualCost.moneyMicros,
      remoteWrites: state.usage.remoteWrites + observation.actualCost.remoteWrites,
    },
  };
  const freshInterruption =
    boundary.interruption?.owner || boundary.interruption?.system
      ? boundary.interruption
      : observation.interruption;
  const interrupted = interruptionTransition(observedState, freshInterruption);
  if (interrupted) return interrupted;
  if (observation.objectiveReached && observation.verified) {
    return stopped(observedState, "completed", "The objective success condition was reached.");
  }
  if (usageExceedsLimits(observedState)) {
    return {
      state: { ...observedState, status: "waiting", activeAction: null },
      decision: { type: "ask", escalation: makeBudgetEscalation() },
    };
  }

  if (observation.outcome === "succeeded" && observation.verified) {
    return {
      state: {
        ...observedState,
        status: "ready",
        activeAction: null,
        recoveryAttempts: 0,
      },
      decision: observation.evidenceChanged
        ? { type: "replan", reason: "Verified evidence changed the task state." }
        : { type: "continue", reason: "The action completed and was verified." },
    };
  }

  const verificationFailed =
    observation.outcome === "succeeded" && !observation.verified;
  if (verificationFailed) {
    if (
      observedState.recoveryAttempts < observedState.limits.maxRecoveryAttempts &&
      observedState.usage.iterations < observedState.limits.maxIterations
    ) {
      const nextIteration = observedState.usage.iterations + 1;
      const boundaryTransition = executionBoundaryTransition(
        observedState,
        action,
        boundary.execution,
        nextIteration,
      );
      if (boundaryTransition) return boundaryTransition;
      return {
        state: {
          ...observedState,
          usage: { ...observedState.usage, iterations: nextIteration },
          recoveryAttempts: observedState.recoveryAttempts + 1,
        },
        decision: {
          type: "retry",
          target: "observe",
          candidateId: action.candidateId,
          reason: "The action succeeded but verification has not settled.",
        },
      };
    }
    if (observation.sideEffect === "applied" && observation.rollbackAvailable) {
      return {
        state: { ...observedState, status: "waiting", activeAction: null },
        decision: {
          type: "rollback",
          candidateId: action.candidateId,
          reason: "Verification failed after the bounded recovery attempts.",
        },
      };
    }
    return {
      state: { ...observedState, status: "waiting", activeAction: null },
      decision: {
        type: "ask",
        escalation: makeRecoveryEscalation(action, observation.sideEffect === "unknown"),
      },
    };
  }

  if (observation.outcome === "transient_failure") {
    const canRetry =
      observation.safeToRetry === true &&
      observation.sideEffect !== "unknown" &&
      observedState.recoveryAttempts < observedState.limits.maxRecoveryAttempts &&
      observedState.usage.iterations < observedState.limits.maxIterations &&
      !actionExceedsRemaining(observedState, action);
    if (canRetry) {
      const nextIteration = observedState.usage.iterations + 1;
      const boundaryTransition = executionBoundaryTransition(
        observedState,
        action,
        boundary.execution,
        nextIteration,
      );
      if (boundaryTransition) return boundaryTransition;
      return {
        state: {
          ...observedState,
          usage: {
            ...observedState.usage,
            iterations: nextIteration,
          },
          recoveryAttempts: observedState.recoveryAttempts + 1,
        },
        decision: {
          type: "retry",
          target: "act",
          action,
          reason: "The transient failure is proven safe and remains within bounds.",
        },
      };
    }
    if (actionExceedsRemaining(observedState, action)) {
      return {
        state: { ...observedState, status: "waiting", activeAction: null },
        decision: { type: "ask", escalation: makeBudgetEscalation() },
      };
    }
    return {
      state: { ...observedState, status: "waiting", activeAction: null },
      decision: {
        type: "ask",
        escalation: makeRecoveryEscalation(action, observation.sideEffect === "unknown"),
      },
    };
  }

  if (observation.outcome === "permanent_failure") {
    if (observation.sideEffect === "applied" && observation.rollbackAvailable) {
      return {
        state: { ...observedState, status: "waiting", activeAction: null },
        decision: {
          type: "rollback",
          candidateId: action.candidateId,
          reason: "A verified compensation is available for the failed action.",
        },
      };
    }
    if (observation.sideEffect === "unknown") {
      return {
        state: { ...observedState, status: "waiting", activeAction: null },
        decision: {
          type: "ask",
          escalation: makeRecoveryEscalation(action, true),
        },
      };
    }
    return {
      state: { ...observedState, status: "ready", activeAction: null },
      decision: { type: "replan", reason: "The selected tool failed permanently." },
    };
  }

  return {
    state: { ...observedState, status: "ready", activeAction: null },
    decision: { type: "replan", reason: "The selected tool produced no work." },
  };
}
