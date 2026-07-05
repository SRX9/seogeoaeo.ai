import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/brand/enrich", () => ({ discoverCompetitors: vi.fn() }));
vi.mock("@/lib/brand/repository", () => ({
  createCompetitor: vi.fn(),
  getBrand: vi.fn(),
  getBrandProfile: vi.fn(),
  listCompetitors: vi.fn(),
}));
vi.mock("@/lib/jobs/repository", () => ({
  createAgentJob: vi.fn(async () => ({ id: "job-1" })),
  finishAgentJob: vi.fn(),
}));
vi.mock("@/lib/visibility/answers", () => ({
  recentAnswerExcerpts: vi.fn(async () => ["ChatGPT names Rival for this category."]),
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { discoverCompetitors } from "@/lib/brand/enrich";
import {
  createCompetitor,
  getBrand,
  getBrandProfile,
  listCompetitors,
} from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { maybeRediscoverCompetitors } from "@/lib/jobs/competitor-rediscovery";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";

const mockDiscover = vi.mocked(discoverCompetitors);
const mockList = vi.mocked(listCompetitors);
const mockGetBrand = vi.mocked(getBrand);
const mockGetProfile = vi.mocked(getBrandProfile);
const mockCreate = vi.mocked(createCompetitor);
const mockGetDb = vi.mocked(getDb);

const scope = { workspaceId: "ws-1", brandId: "brand-1" };

/** Stub the fluent select chain used by lastRediscoveryAt. */
function setLastJobAt(createdAt: Date | null) {
  const rows = createdAt ? [{ createdAt }] : [];
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(rows),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetDb.mockReturnValue(chain as any);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const competitor = (url: string) => ({ id: url, name: url, url }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  setLastJobAt(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockGetBrand.mockResolvedValue({ id: "brand-1", name: "Acme" } as any);
  mockGetProfile.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { website: "https://acme.com", productDescription: "CRM", seedKeywords: "crm" } as any,
  );
  mockList.mockResolvedValue([]);
  mockDiscover.mockResolvedValue([]);
});

describe("maybeRediscoverCompetitors", () => {
  it("skips plans without a competitor cap", async () => {
    const result = await maybeRediscoverCompetitors(scope, null);
    expect(result).toEqual({ ran: false, reason: "no_plan_cap" });
    expect(mockList).not.toHaveBeenCalled();
  });

  it("skips when the plan's competitor slots are full", async () => {
    mockList.mockResolvedValue([competitor("https://a.com")]); // indie cap = 1
    const result = await maybeRediscoverCompetitors(scope, "indie");
    expect(result).toEqual({ ran: false, reason: "at_cap" });
    expect(mockDiscover).not.toHaveBeenCalled();
  });

  it("waits out the 15-day interval since the last scan", async () => {
    const now = new Date("2026-07-04T00:00:00Z");
    setLastJobAt(new Date("2026-06-25T00:00:00Z")); // 9 days ago
    const result = await maybeRediscoverCompetitors(scope, "startup", now);
    expect(result).toEqual({ ran: false, reason: "too_soon" });
    expect(mockDiscover).not.toHaveBeenCalled();
  });

  it("runs when due, filters known rivals, and fills only the open slots", async () => {
    const now = new Date("2026-07-04T00:00:00Z");
    setLastJobAt(new Date("2026-06-01T00:00:00Z")); // 33 days ago
    mockList.mockResolvedValue([competitor("https://rival.com")]); // startup cap = 3 → 2 slots
    mockDiscover.mockResolvedValue([
      { name: "Rival", url: "https://rival.com" },
      { name: "New One", url: "https://new-one.com" },
      { name: "New Two", url: "https://new-two.com" },
      { name: "New Three", url: "https://new-three.com" },
    ]);

    const result = await maybeRediscoverCompetitors(scope, "startup", now);

    expect(result).toEqual({ ran: true, added: 2 });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenCalledWith(scope, {
      name: "New One",
      url: "https://new-one.com",
      rssUrl: "",
      sitemapUrl: "",
    });
    // Answer excerpts flow into discovery as evidence.
    expect(mockDiscover.mock.calls[0][0].answerExcerpts).toEqual([
      "ChatGPT names Rival for this category.",
    ]);
    expect(vi.mocked(finishAgentJob)).toHaveBeenCalledWith(
      "job-1",
      "completed",
      expect.stringContaining("2 new competitors"),
      expect.objectContaining({ added: 2 }),
    );
  });

  it("marks the job failed (still holding the cadence) when discovery throws", async () => {
    mockDiscover.mockRejectedValue(new Error("serper down"));
    await expect(maybeRediscoverCompetitors(scope, "startup")).rejects.toThrow("serper down");
    expect(vi.mocked(createAgentJob)).toHaveBeenCalled();
    expect(vi.mocked(finishAgentJob)).toHaveBeenCalledWith("job-1", "failed", expect.any(String));
  });
});
