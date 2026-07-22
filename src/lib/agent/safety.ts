import type { AgentControlState } from "@/lib/agent/memory";

export type AgentOperation =
  | "observation"
  | "drafting"
  | "publishing"
  | "site_write"
  | "billable";

export type AgentActor = "agent" | "owner";

type SafetyEnvironment = Partial<
  Record<
    | "AGENT_OBSERVATION_ENABLED"
    | "AGENT_DRAFTING_ENABLED"
    | "AGENT_PUBLISHING_ENABLED"
    | "AGENT_SITE_WRITES_ENABLED"
    | "AGENT_BILLABLE_ACTIONS_ENABLED"
    | "AGENT_GLOBAL_KILL_SWITCH"
    | "AGENT_GROUNDED_CONTENT_GATE_ENABLED"
    | "AGENT_GOAL_KERNEL_ENABLED",
    string | undefined
  >
>;

export type AgentSafetyConfig = {
  observationEnabled: boolean;
  draftingEnabled: boolean;
  publishingEnabled: boolean;
  siteWritesEnabled: boolean;
  billableActionsEnabled: boolean;
  globalKillSwitch: boolean;
  groundedContentGateEnabled: boolean;
  goalKernelEnabled: boolean;
};

export type AgentSafetyContext = {
  actor: AgentActor;
  controls?: Pick<AgentControlState, "paused" | "pauseInstruction" | "publishingPaused" | "publishingPauseInstruction">;
  env?: SafetyEnvironment;
  liveCapability?: {
    certified: boolean;
    reversible: boolean;
    approvalValidated?: boolean;
  };
};

export type AgentSafetyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

const ENABLED = new Set(["1", "true", "yes", "on"]);
const DISABLED = new Set(["0", "false", "no", "off"]);

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (ENABLED.has(normalized)) return true;
  if (DISABLED.has(normalized)) return false;
  // Safety flags fail closed when present but malformed.
  return false;
}

export function getAgentSafetyConfig(
  env: SafetyEnvironment = process.env as SafetyEnvironment,
): AgentSafetyConfig {
  return {
    observationEnabled: readBoolean(env.AGENT_OBSERVATION_ENABLED, true),
    draftingEnabled: readBoolean(env.AGENT_DRAFTING_ENABLED, true),
    publishingEnabled: readBoolean(env.AGENT_PUBLISHING_ENABLED, true),
    // No live-site mutation is available before the certified connector phase.
    siteWritesEnabled: readBoolean(env.AGENT_SITE_WRITES_ENABLED, false),
    billableActionsEnabled: readBoolean(env.AGENT_BILLABLE_ACTIONS_ENABLED, true),
    globalKillSwitch: readBoolean(env.AGENT_GLOBAL_KILL_SWITCH, false),
    // Existing FULL_AUTO brands keep their current behavior. New enrollment is
    // frozen until the grounded publication gate is explicitly available.
    groundedContentGateEnabled: readBoolean(env.AGENT_GROUNDED_CONTENT_GATE_ENABLED, false),
    // Agentic selection remains shadow/off until Phase 4 rollout evidence is reviewed.
    goalKernelEnabled: readBoolean(env.AGENT_GOAL_KERNEL_ENABLED, false),
  };
}

export function getAgentSafetyDecision(
  operation: AgentOperation,
  context: AgentSafetyContext,
): AgentSafetyDecision {
  if (context.actor === "owner") return { allowed: true };

  const config = getAgentSafetyConfig(context.env);
  if (config.globalKillSwitch) {
    return { allowed: false, reason: "Agent work is disabled by the global emergency stop." };
  }
  if (context.controls?.paused) {
    return {
      allowed: false,
      reason: context.controls.pauseInstruction ?? "Agent paused by owner",
    };
  }
  if (operation === "publishing" && context.controls?.publishingPaused) {
    return {
      allowed: false,
      reason: context.controls.publishingPauseInstruction ?? "Agent publishing is paused by the owner.",
    };
  }

  if (operation === "site_write") {
    if (!context.liveCapability?.certified) {
      return {
        allowed: false,
        reason: "This live connector capability has not passed certification.",
      };
    }
    if (
      !context.liveCapability.reversible &&
      context.liveCapability.approvalValidated !== true
    ) {
      return {
        allowed: false,
        reason: "This irreversible connector action requires fresh owner approval.",
      };
    }
  }

  const enabled = {
    observation: config.observationEnabled,
    drafting: config.draftingEnabled,
    publishing: config.publishingEnabled,
    site_write: config.siteWritesEnabled,
    billable: config.billableActionsEnabled,
  }[operation];

  return enabled
    ? { allowed: true }
    : { allowed: false, reason: `Agent ${operation.replace("_", " ")} is disabled by system policy.` };
}

export class AgentSafetyError extends Error {
  readonly code = "AGENT_SAFETY_BLOCKED";

  constructor(
    public readonly operation: AgentOperation,
    message: string,
  ) {
    super(message);
    this.name = "AgentSafetyError";
  }
}

export function assertAgentOperationAllowed(
  operation: AgentOperation,
  context: AgentSafetyContext,
): void {
  const decision = getAgentSafetyDecision(operation, context);
  if (!decision.allowed) throw new AgentSafetyError(operation, decision.reason);
}

/** New FULL_AUTO enrollment is frozen until grounded publishing is certified. */
export function canEnrollNewFullAuto(
  env: SafetyEnvironment = process.env as SafetyEnvironment,
): boolean {
  const config = getAgentSafetyConfig(env);
  return (
    !config.globalKillSwitch &&
    config.publishingEnabled &&
    config.groundedContentGateEnabled
  );
}

/** Fast mode may skip editorial holds, never platform or owner safety controls. */
export function canEnrollFastAutoPublish(
  env: SafetyEnvironment = process.env as SafetyEnvironment,
): boolean {
  const config = getAgentSafetyConfig(env);
  return !config.globalKillSwitch && config.publishingEnabled;
}

/** Fixed workflows remain the default until the goal-kernel rollout gate opens. */
export function canRunGoalKernel(
  env: SafetyEnvironment = process.env as SafetyEnvironment,
): boolean {
  const config = getAgentSafetyConfig(env);
  return config.goalKernelEnabled && !config.globalKillSwitch;
}
