import { describe, expect, it } from "vitest";
import { analyzeCrawlerAccess, CRAWLER_TIERS, parseContentSignals } from "./crawler-access";
import { classifyCrawlers, parseRobots } from "./robots";
import type { RobotsResult } from "./types";

function robotsFrom(content: string, exists = true): RobotsResult {
  const { agentRules, sitemaps } = parseRobots(content);
  return {
    url: "https://acme.example/robots.txt",
    exists,
    content,
    agent_rules: agentRules,
    ai_crawler_status: exists ? classifyCrawlers(agentRules) : {},
    sitemaps,
    errors: [],
  };
}

const OPEN_WITH_SITEMAP = `
User-agent: *
Disallow:

Sitemap: https://acme.example/sitemap.xml
`;

describe("analyzeCrawlerAccess", () => {
  it("scores 100 for fully-open robots with a sitemap", () => {
    const result = analyzeCrawlerAccess(robotsFrom(OPEN_WITH_SITEMAP));
    expect(result.score).toBe(100);
    expect(result.crawlers).toHaveLength(14);
    expect(result.crawlers.every((c) => !c.blocked)).toBe(true);
    expect(result.findings.filter((f) => f.category === "crawler_access")).toHaveLength(0);
  });

  it("deducts 15 for a blocked critical crawler (GPTBot → 85)", () => {
    const result = analyzeCrawlerAccess(
      robotsFrom(`User-agent: GPTBot\nDisallow: /\n\nSitemap: https://acme.example/sitemap.xml`),
    );
    expect(result.score).toBe(85);
    const finding = result.findings.find((f) => f.title.includes("GPTBot"));
    expect(finding?.severity).toBe("high");
    expect(finding?.fix_capability).toBe("auto");
  });

  it("deducts 5 for a blocked secondary crawler", () => {
    const result = analyzeCrawlerAccess(
      robotsFrom(`User-agent: CCBot\nDisallow: /\n\nSitemap: https://acme.example/sitemap.xml`),
    );
    expect(result.score).toBe(95);
    expect(result.findings.find((f) => f.title.includes("CCBot"))?.severity).toBe("low");
  });

  it("floors at 0 for a wildcard Disallow: / (blocks everything incl. Googlebot)", () => {
    const result = analyzeCrawlerAccess(robotsFrom("User-agent: *\nDisallow: /\n"));
    // 4 critical AI + Googlebot = −75, 10 secondary = −50, no sitemap = −10 → floor 0
    expect(result.score).toBe(0);
    expect(result.googlebotBlocked).toBe(true);
    expect(result.findings.some((f) => f.severity === "critical")).toBe(true);
  });

  it("deducts 10 when no sitemap is referenced", () => {
    const result = analyzeCrawlerAccess(robotsFrom("User-agent: *\nDisallow:\n"));
    expect(result.score).toBe(90);
    expect(result.sitemapReferenced).toBe(false);
  });

  it("classifies all 14 crawlers into tiers with status", () => {
    const result = analyzeCrawlerAccess(robotsFrom(OPEN_WITH_SITEMAP));
    for (const tier of [1, 2, 3] as const) {
      const entries = result.crawlers.filter((c) => c.tier === tier);
      expect(entries.map((c) => c.crawler)).toEqual([...CRAWLER_TIERS[tier]]);
      expect(entries.every((c) => c.status === "ALLOWED_BY_DEFAULT")).toBe(true);
    }
  });

  it("emits a recommended robots.txt allowing Tier 1/2 and keeping sitemaps", () => {
    const result = analyzeCrawlerAccess(
      robotsFrom(`User-agent: GPTBot\nDisallow: /\n\nSitemap: https://acme.example/sitemap.xml`),
    );
    expect(result.recommendedRobotsTxt).toContain("User-agent: GPTBot\nAllow: /");
    expect(result.recommendedRobotsTxt).toContain("User-agent: Google-Extended");
    expect(result.recommendedRobotsTxt).toContain("Sitemap: https://acme.example/sitemap.xml");
  });
});

describe("parseContentSignals", () => {
  it("passes a valid 3-pair directive with plain-English meaning", () => {
    const result = parseContentSignals(
      "User-agent: *\nContent-Signal: ai-train=no, search=yes, ai-retrieval=yes\n",
    );
    expect(result.status).toBe("pass");
    expect(result.signals).toEqual({ "ai-train": "no", search: "yes", "ai-retrieval": "yes" });
    expect(result.explanation).toContain("must not be used to train");
  });

  it("warns on an unknown key (draft is evolving: never a failure)", () => {
    const result = parseContentSignals("Content-Signal: ai-input=yes, search=yes\n");
    expect(result.status).toBe("warning");
    expect(result.issues[0]).toContain('Unknown key "ai-input"');
    expect(result.signals["ai-input"]).toBe("yes");
  });

  it("warns on an invalid value", () => {
    const result = parseContentSignals("Content-Signal: ai-train=maybe\n");
    expect(result.status).toBe("warning");
    expect(result.issues[0]).toContain('Invalid value "maybe"');
  });

  it("recommends when absent", () => {
    const result = parseContentSignals("User-agent: *\nDisallow:\n");
    expect(result.status).toBe("recommendation");
    expect(result.explanation).toContain("contentsignals.org");
  });

  it("never affects the Crawler Access Score", () => {
    const withSignals = analyzeCrawlerAccess(
      robotsFrom(OPEN_WITH_SITEMAP + "\nContent-Signal: ai-train=no\n"),
    );
    const withoutSignals = analyzeCrawlerAccess(robotsFrom(OPEN_WITH_SITEMAP));
    expect(withSignals.score).toBe(withoutSignals.score);
  });
});
