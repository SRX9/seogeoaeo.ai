import { describe, expect, it } from "vitest";
import { selectNextKernelTask } from "./kernel-runtime";
import { orderTasksByPlan, readPlanTaskOrder } from "./strategy";

describe("strategy task ordering", () => {
  it("deduplicates explicit order and keeps newly added tasks stable at the end", () => {
    const evidence = {
      orderedTaskIds: ["scheduled-b", "scheduled-a", "scheduled-b", "missing"],
    };
    const tasks = [
      { id: "scheduled-a" },
      { id: "scheduled-b" },
      { id: "new-task" },
    ];

    expect(readPlanTaskOrder(evidence)).toEqual([
      "scheduled-b",
      "scheduled-a",
      "missing",
    ]);
    expect(orderTasksByPlan(tasks, evidence).map((task) => task.id)).toEqual([
      "scheduled-b",
      "scheduled-a",
      "new-task",
    ]);
  });

  it("selects the next due dynamic task in owner order without bypassing dependencies", () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const tasks = [
      { id: "fallback", status: "planned", dependencies: [], scheduledFor: null },
      {
        id: "owner-first",
        status: "scheduled",
        dependencies: ["research"],
        scheduledFor: now,
      },
    ];
    const evidence = { orderedTaskIds: ["owner-first", "fallback"] };

    expect(
      selectNextKernelTask(tasks, evidence, new Set(["research"]), now)?.id,
    ).toBe("owner-first");
    expect(selectNextKernelTask(tasks, evidence, new Set(), now)?.id).toBe("fallback");

    expect(
      selectNextKernelTask(
        [
          ...tasks,
          {
            id: "expired-work",
            status: "in_progress",
            dependencies: [],
            scheduledFor: now,
          },
        ],
        evidence,
        new Set(["research"]),
        now,
      )?.id,
    ).toBe("expired-work");
  });
});
