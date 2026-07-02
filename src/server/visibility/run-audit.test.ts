import { describe, expect, it } from "vitest";
import { parseRobots } from "@/lib/visibility/robots";
import type { RobotsResult } from "@/lib/visibility/types";
import { fetchPagesWithGates, isAllowedByRobots, QUALITY_GATES } from "./run-audit";

function robotsResult(content: string): RobotsResult {
  const { agentRules, sitemaps } = parseRobots(content);
  return {
    url: "https://acme.example/robots.txt",
    exists: true,
    content,
    agent_rules: agentRules,
    ai_crawler_status: {},
    sitemaps,
    errors: [],
  };
}

describe("isAllowedByRobots", () => {
  const robots = robotsResult("User-agent: *\nDisallow: /admin\nAllow: /admin/public\n");

  it("blocks disallowed prefixes and honors more specific Allow rules", () => {
    expect(isAllowedByRobots(robots, "https://acme.example/pricing")).toBe(true);
    expect(isAllowedByRobots(robots, "https://acme.example/admin/settings")).toBe(false);
    expect(isAllowedByRobots(robots, "https://acme.example/admin/public/page")).toBe(true);
  });

  it("allows everything when there is no wildcard group", () => {
    expect(isAllowedByRobots(robotsResult(""), "https://acme.example/x")).toBe(true);
  });
});

describe("fetchPagesWithGates", () => {
  it("caps at maxPages and never exceeds maxConcurrent in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const urls = Array.from({ length: 60 }, (_, i) => `https://acme.example/p/${i}`);

    const snapshots = await fetchPagesWithGates(urls, {
      spacingMs: 0,
      fetchImpl: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return new Response("<html><body><p>ok</p></body></html>", { status: 200 });
      },
    });

    expect(snapshots).toHaveLength(QUALITY_GATES.maxPages);
    expect(peak).toBeLessThanOrEqual(QUALITY_GATES.maxConcurrent);
  });
});
