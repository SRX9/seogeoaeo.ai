/** Truthful presence derived only from durable execution and blocking state. */
import type {
  AgentPresenceId,
  AgentPresenceLabel,
  AgentPresenceView,
} from "@/lib/agent/types";

export type { AgentPresenceId, AgentPresenceLabel, AgentPresenceView } from "@/lib/agent/types";

export type AgentPresenceInput = {
  setupStatus?: string | null;
  automation?: {
    enabled: boolean;
    agentState: string;
    lastRun?: { status: string } | null;
  } | null;
  activityInFlight?: boolean;
  inFlightTaskCount?: number;
  staleInFlightTaskCount?: number;
  pendingApprovalCount?: number;
  failedTaskCount?: number;
  nextScheduledAt?: string | null;
};

const LABELS: Record<AgentPresenceId, AgentPresenceLabel> = {
  working_now: "Working now",
  on_duty: "On duty",
  waiting_for_you: "Waiting for you",
  scheduled: "Scheduled",
  paused: "Paused",
  needs_attention: "Needs attention",
};

function presence(id: AgentPresenceId, reason: string): AgentPresenceView {
  return { id, label: LABELS[id], reason, isWorking: id === "working_now" };
}

export function getAgentPresence(input: AgentPresenceInput): AgentPresenceView | null {
  const setup = input.setupStatus;
  if (setup === "running") {
    return presence("working_now", "Claudia is actively setting up this brand.");
  }
  if (setup === "blocked" || setup === "failed" || setup === "completed_degraded") {
    return presence(
      "needs_attention",
      setup === "completed_degraded"
        ? "Setup finished with recoverable gaps that still need attention."
        : "Setup stopped and needs a recovery action.",
    );
  }
  if (setup && setup !== "completed") {
    return presence("needs_attention", "Setup is in an unexpected state and needs attention.");
  }

  if ((input.staleInFlightTaskCount ?? 0) > 0 || (input.failedTaskCount ?? 0) > 0) {
    return presence("needs_attention", "A task stopped without recovering on its own.");
  }
  if ((input.inFlightTaskCount ?? 0) > 0 || input.activityInFlight) {
    return presence("working_now", "A recorded task is executing now.");
  }

  const automation = input.automation;
  if (!automation) return null;
  if (
    !automation.enabled ||
    automation.agentState === "paused_no_credits" ||
    automation.agentState === "paused_no_subscription" ||
    automation.agentState === "paused_by_owner"
  ) {
    return presence(
      "paused",
      automation.agentState === "paused_no_credits"
        ? "The credit budget is exhausted."
        : automation.agentState === "paused_by_owner"
          ? "The owner paused autonomous work."
          : automation.enabled
            ? "The current plan does not allow autonomous work."
            : "Autonomous work is turned off.",
    );
  }
  if ((input.pendingApprovalCount ?? 0) > 0) {
    return presence("waiting_for_you", "A useful task is waiting on an owner decision.");
  }

  const lastRun = automation.lastRun?.status;
  if (lastRun === "running" || lastRun === "pending") {
    return presence("working_now", "A recorded workflow is executing now.");
  }
  if (input.nextScheduledAt) {
    return presence("scheduled", `The next task is planned for ${input.nextScheduledAt}.`);
  }
  return presence("on_duty", "Autonomy is enabled and Claudia is ready for the next useful task.");
}

export function isAgentLive(input: AgentPresenceInput): boolean {
  return getAgentPresence(input)?.isWorking ?? false;
}
