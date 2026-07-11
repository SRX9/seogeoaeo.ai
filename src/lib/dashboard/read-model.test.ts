import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDashboardVisibilitySummary } from "@/lib/dashboard/read-model";
import { getDb } from "@/lib/db";

describe("dashboard visibility summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves the latest completed audit details", async () => {
    const rows = [
      {
        id: "audit-2",
        overall: 82,
        aiVisibility: 74,
        businessType: "saas",
        completedAt: new Date("2026-07-10T12:30:00.000Z"),
        citability: 81,
        brand: 77,
        eeat: 83,
        technical: 91,
        schema: 69,
        platform: 72,
      },
      { id: "audit-1", overall: 76 },
    ];
    const query = {
      select: () => query,
      from: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => Promise.resolve(rows),
    };
    // The test only implements the fluent query methods used by this read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getDb).mockReturnValue(query as any);

    const summary = await getDashboardVisibilitySummary("workspace-1", "brand-1");

    expect(summary).toEqual({
      hasAudit: true,
      latest: {
        id: "audit-2",
        overall: 82,
        band: "Good",
        aiVisibility: 74,
        businessType: "saas",
        completedAt: "2026-07-10T12:30:00.000Z",
        subScores: {
          citability: 81,
          brand: 77,
          eeat: 83,
          technical: 91,
          schema: 69,
          platform: 72,
        },
      },
      previousOverall: 76,
      baseline: { baseline: null, sample: 0, scope: "dashboard" },
    });
  });
});
