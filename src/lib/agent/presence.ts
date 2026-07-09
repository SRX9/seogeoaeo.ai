/**
 * Single source of truth for Claudia's presence (shell pill, Live badge, Ask status).
 * Pure — pass structured inputs from queries / server loaders.
 */

export type AgentPresenceLabel =
  | "Setting up"
  | "Needs attention"
  | "Paused"
  | "Working"
  | "On duty";

export type AgentPresenceInput = {
  /** Setup run status when known. */
  setupStatus?: string | null;
  automation?: {
    enabled: boolean;
    agentState: string;
    writtenToday: number;
    lastRun?: { status: string } | null;
  } | null;
  /** True when activity feed has pending/running jobs, runs, or competitor scans. */
  activityInFlight?: boolean;
};

export function getAgentPresence(input: AgentPresenceInput): AgentPresenceLabel | null {
  const setup = input.setupStatus;
  if (setup && setup !== "completed" && setup !== "failed") {
    return "Setting up";
  }
  if (setup === "failed") return "Needs attention";

  const stats = input.automation;
  if (!stats) return null;

  if (!stats.enabled) return "Paused";
  if (
    stats.agentState === "paused_no_credits" ||
    stats.agentState === "paused_no_subscription"
  ) {
    return "Paused";
  }

  const last = stats.lastRun?.status;
  if (
    input.activityInFlight ||
    last === "running" ||
    last === "pending" ||
    stats.writtenToday > 0
  ) {
    return "Working";
  }

  return "On duty";
}

/** Live chrome (work stream badge) — true only when work is actually in flight. */
export function isAgentLive(input: AgentPresenceInput): boolean {
  const setup = input.setupStatus;
  if (setup === "running" || setup === "pending") return true;
  if (input.activityInFlight) return true;
  const last = input.automation?.lastRun?.status;
  return last === "running" || last === "pending";
}
