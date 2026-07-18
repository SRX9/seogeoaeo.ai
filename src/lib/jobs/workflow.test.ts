import { describe, expect, it, vi } from "vitest";
import {
  enqueueWorkflowInstances,
  type EnqueueOutcome,
  type InstanceOptions,
} from "./workflow";

vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));

describe("enqueueWorkflowInstances", () => {
  it("records each fallback outcome and creates only dropped work on an idempotent retry", async () => {
    const existingIds = new Set(["already-running"]);
    let dropTransiently = true;
    const workflow = {
      createBatch: vi.fn(
        async (): Promise<Array<{ id: string }>> => {
          throw new Error("batch rejected");
        },
      ),
      create: vi.fn(async (options?: { id?: string; params?: unknown }) => {
        const id = options?.id;
        if (!id) throw new Error("missing instance id");
        if (existingIds.has(id)) throw new Error(`Workflow instance ${id} already exists`);
        if (id === "dropped" && dropTransiently) throw new Error("workflow binding unavailable");
        existingIds.add(id);
        return { id };
      }),
    };
    const instances: InstanceOptions[] = [
      { id: "already-running", params: {} },
      { id: "created", params: {} },
      { id: "dropped", params: {} },
    ];
    const outcomes: Array<{ id: string; outcome: EnqueueOutcome }> = [];
    const onOutcome = vi.fn(async (instance: InstanceOptions, outcome: EnqueueOutcome) => {
      outcomes.push({ id: instance.id, outcome });
    });

    await expect(
      enqueueWorkflowInstances(workflow, instances, "test.workflow", onOutcome),
    ).resolves.toEqual({ created: 1, skipped: 1, failed: 1 });
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { id: "already-running", outcome: "exists" },
        { id: "created", outcome: "created" },
        { id: "dropped", outcome: "failed" },
      ]),
    );

    dropTransiently = false;
    outcomes.length = 0;

    await expect(
      enqueueWorkflowInstances(workflow, instances, "test.workflow", onOutcome),
    ).resolves.toEqual({ created: 1, skipped: 2, failed: 0 });
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { id: "already-running", outcome: "exists" },
        { id: "created", outcome: "exists" },
        { id: "dropped", outcome: "created" },
      ]),
    );
    expect(onOutcome).toHaveBeenCalledTimes(6);
  });
});
