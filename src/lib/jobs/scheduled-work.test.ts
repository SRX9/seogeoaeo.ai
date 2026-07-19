import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import {
  assignScheduledReplayInstance,
  getScheduledReplayInstanceId,
  recordScheduledEnqueueOutcome,
} from "@/lib/jobs/scheduled-work";

const mockGetDb = vi.mocked(getDb);

function mockUpdate() {
  const set = vi.fn();
  const chain = {
    update: () => chain,
    set,
    where: () => chain,
    returning: () => Promise.resolve([{ id: "work-1" }]),
  };
  set.mockReturnValue(chain);
  // The test only implements the fluent query methods used by this update.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetDb.mockReturnValue(chain as any);
  return set;
}

describe("scheduled work replay accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives an operator replay a fresh attempt budget", async () => {
    const set = mockUpdate();

    await assignScheduledReplayInstance("work-1", "instance-replay-6", true);

    expect(set).toHaveBeenCalledWith(expect.objectContaining({ attemptCount: 0 }));
  });

  it("preserves the attempt count for an automatic replay", async () => {
    const set = mockUpdate();

    await assignScheduledReplayInstance("work-1", "instance-replay-2");

    expect(set.mock.calls[0][0]).not.toHaveProperty("attemptCount");
  });

  it("does not spend the attempt budget on an existing instance", async () => {
    const set = mockUpdate();

    await recordScheduledEnqueueOutcome("existing-instance", "exists");

    expect(set.mock.calls[0][0]).not.toHaveProperty("attemptCount");
  });

  it("counts a newly created executor attempt", async () => {
    const set = mockUpdate();

    await recordScheduledEnqueueOutcome("new-instance", "created");

    expect(set.mock.calls[0][0]).toHaveProperty("attemptCount");
  });

  it("keeps replay IDs unique and assignment idempotent after a budget reset", () => {
    const logicalId = "daily-brand-2026-07-19";
    const revived = {
      workflowInstanceId: `${logicalId}-replay-6`,
      attemptCount: 1,
      status: "enqueued",
      operatorReplayRequested: false,
    };

    expect(getScheduledReplayInstanceId(logicalId, revived)).toBe(
      `${logicalId}-replay-7`,
    );
    expect(
      getScheduledReplayInstanceId(logicalId, {
        ...revived,
        workflowInstanceId: `${logicalId}-replay-7`,
        status: "expected",
      }),
    ).toBe(`${logicalId}-replay-7`);
  });
});
