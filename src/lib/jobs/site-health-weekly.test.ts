import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cadence + outcome tests for Claudia's weekly Site Health check. The refresh
 * itself (fetch + PSI + KV + findings) is covered by site-health.test.ts and
 * the route; here we verify the weekly gate that bounds PageSpeed usage to one
 * scheduled call per brand per week, and that the agent-job trail is correct.
 */

const lastJobRows: Array<{ createdAt: Date }> = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => lastJobRows }) }),
      }),
    }),
  }),
}));

const getBrandProfile = vi.fn(async () => ({ website: "https://acme.example" }));
vi.mock("@/lib/brand/repository", () => ({
  getBrandProfile: (...args: unknown[]) => getBrandProfile(...(args as [])),
}));

const createAgentJob = vi.fn(async () => ({ id: "job-1" }));
const finishAgentJob = vi.fn(async () => undefined);
vi.mock("@/lib/jobs/repository", () => ({
  createAgentJob: (...args: unknown[]) => createAgentJob(...(args as [])),
  finishAgentJob: (...args: unknown[]) => finishAgentJob(...(args as [])),
}));

const refreshSiteHealth = vi.fn();
vi.mock("@/lib/visibility/site-health-refresh", () => ({
  refreshSiteHealth: (...args: unknown[]) => refreshSiteHealth(...(args as [])),
  SiteUnreachableError: class SiteUnreachableError extends Error {},
}));

import { SiteUnreachableError } from "@/lib/visibility/site-health-refresh";
import { maybeRunWeeklySiteHealth, SITE_HEALTH_INTERVAL_DAYS } from "./site-health-weekly";

const scope = { workspaceId: "ws-1", brandId: "brand-1" };
const DAY_MS = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  lastJobRows.length = 0;
  getBrandProfile.mockResolvedValue({ website: "https://acme.example" });
  refreshSiteHealth.mockResolvedValue({ summary: { pass: 20, warn: 2, fail: 1 } });
});

describe("maybeRunWeeklySiteHealth", () => {
  it("skips when the last check is younger than the interval", async () => {
    lastJobRows.push({ createdAt: new Date(Date.now() - 2 * DAY_MS) });
    const result = await maybeRunWeeklySiteHealth(scope);
    expect(result).toEqual({ ran: false, reason: "too_soon" });
    expect(refreshSiteHealth).not.toHaveBeenCalled();
    expect(createAgentJob).not.toHaveBeenCalled();
  });

  it("runs once the interval has elapsed and records the summary", async () => {
    lastJobRows.push({
      createdAt: new Date(Date.now() - (SITE_HEALTH_INTERVAL_DAYS + 1) * DAY_MS),
    });
    const result = await maybeRunWeeklySiteHealth(scope);
    expect(result).toEqual({ ran: true, pass: 20, warn: 2, fail: 1 });
    expect(refreshSiteHealth).toHaveBeenCalledWith("ws-1", "https://acme.example", "agent");
    expect(createAgentJob).toHaveBeenCalledWith(scope, "site_health_check", expect.any(String));
    expect(finishAgentJob).toHaveBeenCalledWith(
      "job-1",
      "completed",
      expect.stringContaining("3 need attention"),
      { pass: 20, warn: 2, fail: 1 },
    );
  });

  it("celebrates an all-green site", async () => {
    refreshSiteHealth.mockResolvedValue({ summary: { pass: 23, warn: 0, fail: 0 } });
    await maybeRunWeeklySiteHealth(scope);
    expect(finishAgentJob).toHaveBeenCalledWith(
      "job-1",
      "completed",
      "Checked 23 things on your site — everything looks great.",
      { pass: 23, warn: 0, fail: 0 },
    );
  });

  it("skips brands without a website and leaves no job row", async () => {
    getBrandProfile.mockResolvedValue({ website: "" });
    const result = await maybeRunWeeklySiteHealth(scope);
    expect(result).toEqual({ ran: false, reason: "no_website" });
    expect(createAgentJob).not.toHaveBeenCalled();
  });

  it("records an unreachable site as a failed job and waits out the interval", async () => {
    refreshSiteHealth.mockRejectedValue(new SiteUnreachableError("status 503"));
    const result = await maybeRunWeeklySiteHealth(scope);
    expect(result).toEqual({ ran: false, reason: "site_unreachable" });
    expect(finishAgentJob).toHaveBeenCalledWith(
      "job-1",
      "failed",
      expect.stringContaining("Couldn't reach"),
    );
  });

  it("marks the job failed and rethrows on unexpected errors", async () => {
    refreshSiteHealth.mockRejectedValue(new Error("db exploded"));
    await expect(maybeRunWeeklySiteHealth(scope)).rejects.toThrow("db exploded");
    expect(finishAgentJob).toHaveBeenCalledWith("job-1", "failed", "Site health check failed.");
  });
});
