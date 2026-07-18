import { describe, expect, it } from "vitest";
import { rebuildFutureTaskForMemoryCorrection } from "@/lib/agent/planner";

describe("memory-correction task propagation", () => {
  it("rebuilds only pristine fixed work and cancels stale or unknown work", () => {
    const pristine = {
      taskType: "daily_growth_pass",
      title: "Old audience-specific plan",
      input: { audience: "superseded", evidenceRefs: ["memory:old"] },
      attempt: 0,
      startedAt: null,
      completedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      artifactRef: null,
      outcomeRef: null,
    };

    const rebuilt = rebuildFutureTaskForMemoryCorrection(pristine, "correction-1");
    expect(rebuilt.action).toBe("rebuild");
    if (rebuilt.action === "rebuild") {
      expect(rebuilt.values.dependencies).toEqual([]);
      expect(rebuilt.values.input).toEqual({
        memoryCorrectionId: "correction-1",
        memoryContextVersion: "claudia-memory-runtime-v1",
        resolveMemoryAtExecution: true,
      });
      expect(rebuilt.values.input).not.toHaveProperty("audience");
      expect(rebuilt.values.input).not.toHaveProperty("evidenceRefs");
    }

    expect(
      rebuildFutureTaskForMemoryCorrection(
        { ...pristine, attempt: 1, startedAt: new Date("2026-07-14T08:00:00Z") },
        "correction-1",
      ),
    ).toMatchObject({ action: "cancel" });
    expect(
      rebuildFutureTaskForMemoryCorrection(
        { ...pristine, taskType: "unregistered_dynamic_work" },
        "correction-1",
      ),
    ).toMatchObject({ action: "cancel" });
  });
});
