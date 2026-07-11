import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/brand-intelligence/route";
import {
  isBrandIntelligenceConfigured,
  listDueBrandIntelligence,
  refreshBrandIntelligence,
} from "@/lib/brand/intelligence";
import { isCronAuthorized } from "@/lib/cron/auth";

vi.mock("@/lib/brand/intelligence", () => ({
  isBrandIntelligenceConfigured: vi.fn(),
  listDueBrandIntelligence: vi.fn(),
  refreshBrandIntelligence: vi.fn(),
}));

vi.mock("@/lib/cron/auth", () => ({ isCronAuthorized: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

describe("/api/cron/brand-intelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isCronAuthorized).mockReturnValue(true);
    vi.mocked(isBrandIntelligenceConfigured).mockReturnValue(true);
    vi.mocked(listDueBrandIntelligence).mockResolvedValue([
      { workspaceId: "ws-1", brandId: "brand-1", website: "https://one.test" },
      { workspaceId: "ws-1", brandId: "brand-2", website: "https://two.test" },
    ]);
  });

  it("reports a completed partial sweep without returning a cron-level failure", async () => {
    vi.mocked(refreshBrandIntelligence)
      .mockRejectedValueOnce(new Error("Context.dev unavailable"))
      .mockResolvedValueOnce({ id: "snapshot-2" } as Awaited<
        ReturnType<typeof refreshBrandIntelligence>
      >);

    const response = await GET(new Request("https://app.test/api/cron/brand-intelligence"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      partial: true,
      due: 2,
      refreshed: 1,
      failed: 1,
    });
  });
});
