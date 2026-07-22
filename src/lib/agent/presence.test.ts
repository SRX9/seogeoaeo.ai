import { describe, expect, it } from "vitest";
import { getAgentPresence } from "@/lib/agent/presence";

const enabled = { enabled: true, agentState: "active", lastRun: { status: "completed" } };

describe("getAgentPresence", () => {
  it("shows working only for an execution that is in flight", () => {
    expect(getAgentPresence({ automation: enabled })?.id).toBe("on_duty");
    expect(getAgentPresence({ automation: enabled, inFlightTaskCount: 1 })?.id).toBe(
      "working_now",
    );
  });

  it("does not present a stale task as live work", () => {
    const state = getAgentPresence({
      automation: enabled,
      inFlightTaskCount: 0,
      staleInFlightTaskCount: 1,
    });
    expect(state).toMatchObject({ id: "needs_attention", isWorking: false });
  });

  it("does not present blocked or degraded setup as live work", () => {
    expect(getAgentPresence({ setupStatus: "blocked", automation: enabled })).toMatchObject({
      id: "needs_attention",
      isWorking: false,
    });
    expect(
      getAgentPresence({ setupStatus: "completed_degraded", automation: enabled }),
    ).toMatchObject({ id: "needs_attention", isWorking: false });
    expect(getAgentPresence({ setupStatus: "running", automation: enabled })).toMatchObject({
      id: "working_now",
      isWorking: true,
    });
  });

  it("prioritizes a real owner dependency over the schedule", () => {
    expect(
      getAgentPresence({
        automation: enabled,
        pendingApprovalCount: 1,
        nextScheduledAt: "2026-07-11T08:00:00.000Z",
      })?.id,
    ).toBe("waiting_for_you");
  });

  it("distinguishes scheduled, on-duty, and paused states", () => {
    expect(
      getAgentPresence({
        automation: enabled,
        nextScheduledAt: "2026-07-11T08:00:00.000Z",
      })?.id,
    ).toBe("scheduled");
    expect(getAgentPresence({ automation: enabled })?.id).toBe("on_duty");
    expect(
      getAgentPresence({
        automation: { enabled: true, agentState: "paused_no_credits" },
      })?.id,
    ).toBe("paused");
  });
});
