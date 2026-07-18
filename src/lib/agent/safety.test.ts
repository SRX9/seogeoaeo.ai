import { describe, expect, it } from "vitest";
import { canRunGoalKernel, getAgentSafetyDecision } from "./safety";

describe("agent execution safety", () => {
  it("keeps observation available when every write class is disabled", () => {
    const env = {
      AGENT_OBSERVATION_ENABLED: "true",
      AGENT_DRAFTING_ENABLED: "false",
      AGENT_PUBLISHING_ENABLED: "false",
      AGENT_SITE_WRITES_ENABLED: "false",
      AGENT_BILLABLE_ACTIONS_ENABLED: "false",
    };
    expect(getAgentSafetyDecision("observation", { actor: "agent", env }).allowed).toBe(true);
    for (const operation of ["drafting", "publishing", "site_write", "billable"] as const) {
      expect(getAgentSafetyDecision(operation, { actor: "agent", env }).allowed).toBe(false);
    }
  });

  it("defaults live site writes to disabled", () => {
    expect(getAgentSafetyDecision("site_write", { actor: "agent", env: {} }).allowed).toBe(false);
    expect(
      getAgentSafetyDecision("site_write", {
        actor: "agent",
        env: { AGENT_SITE_WRITES_ENABLED: "true" },
        liveCapability: { certified: true, reversible: true },
      }).allowed,
    ).toBe(true);
    expect(
      getAgentSafetyDecision("site_write", {
        actor: "agent",
        env: { AGENT_SITE_WRITES_ENABLED: "true" },
        liveCapability: { certified: false, reversible: true },
      }).allowed,
    ).toBe(false);
    expect(canRunGoalKernel({})).toBe(false);
    expect(canRunGoalKernel({ AGENT_GOAL_KERNEL_ENABLED: "true" })).toBe(true);
    expect(
      canRunGoalKernel({
        AGENT_GOAL_KERNEL_ENABLED: "true",
        AGENT_GLOBAL_KILL_SWITCH: "true",
      }),
    ).toBe(false);
  });

  it("enforces emergency and owner pauses only for agent-initiated work", () => {
    expect(
      getAgentSafetyDecision("observation", {
        actor: "agent",
        env: { AGENT_GLOBAL_KILL_SWITCH: "true" },
      }).allowed,
    ).toBe(false);
    expect(
      getAgentSafetyDecision("publishing", {
        actor: "agent",
        controls: {
          paused: false,
          pauseInstruction: null,
          publishingPaused: true,
          publishingPauseInstruction: "Wait for launch day",
        },
        env: {},
      }).allowed,
    ).toBe(false);
    expect(
      getAgentSafetyDecision("publishing", {
        actor: "owner",
        env: { AGENT_GLOBAL_KILL_SWITCH: "true" },
      }).allowed,
    ).toBe(true);
  });
});
