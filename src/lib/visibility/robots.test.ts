import { describe, expect, it } from "vitest";
import { AI_CRAWLERS, classifyCrawlers, fetchRobots, parseRobots } from "./robots";

const BLOCKS_GPTBOT = `
User-agent: GPTBot
Disallow: /

User-agent: PerplexityBot
Disallow: /private/

User-agent: ClaudeBot
Disallow:

Sitemap: https://acme.example/sitemap.xml
Sitemap: https://acme.example/news-sitemap.xml
`;

const WILDCARD_BLOCK_ALL = `
User-agent: *
Disallow: /
`;

function mockFetch(status: number, body = ""): typeof fetch {
  return async () => new Response(body, { status });
}

describe("parseRobots / classifyCrawlers", () => {
  it("classifies per-agent rules: blocked, partial, allowed, defaults", () => {
    const { agentRules, sitemaps } = parseRobots(BLOCKS_GPTBOT);
    const status = classifyCrawlers(agentRules);

    expect(status.GPTBot).toBe("BLOCKED");
    expect(status.PerplexityBot).toBe("PARTIALLY_BLOCKED");
    // empty Disallow path counts as allowed
    expect(status.ClaudeBot).toBe("ALLOWED");
    // no wildcard group → unmentioned crawlers are NOT_MENTIONED
    expect(status.CCBot).toBe("NOT_MENTIONED");
    expect(status["Google-Extended"]).toBe("NOT_MENTIONED");

    expect(sitemaps).toEqual([
      "https://acme.example/sitemap.xml",
      "https://acme.example/news-sitemap.xml",
    ]);
  });

  it("classifies everything blocked under a wildcard Disallow /", () => {
    const { agentRules } = parseRobots(WILDCARD_BLOCK_ALL);
    const status = classifyCrawlers(agentRules);
    for (const crawler of AI_CRAWLERS) {
      expect(status[crawler]).toBe("BLOCKED_BY_WILDCARD");
    }
  });

  it("classifies ALLOWED_BY_DEFAULT under a permissive wildcard", () => {
    const { agentRules } = parseRobots("User-agent: *\nDisallow:\n");
    // empty Disallow path is falsy in the state machine → allowed by default
    expect(classifyCrawlers(agentRules).GPTBot).toBe("ALLOWED_BY_DEFAULT");
  });
});

describe("fetchRobots", () => {
  it("returns parsed content on 200", async () => {
    const result = await fetchRobots("https://acme.example/some/page", {
      fetchImpl: mockFetch(200, BLOCKS_GPTBOT),
    });
    expect(result.url).toBe("https://acme.example/robots.txt");
    expect(result.exists).toBe(true);
    expect(result.content).toContain("GPTBot");
    expect(result.ai_crawler_status.GPTBot).toBe("BLOCKED");
    expect(result.sitemaps).toHaveLength(2);
  });

  it("marks all crawlers NO_ROBOTS_TXT on 404", async () => {
    const result = await fetchRobots("https://acme.example/", {
      fetchImpl: mockFetch(404),
    });
    expect(result.exists).toBe(false);
    expect(result.errors).toContain("No robots.txt found (404)");
    for (const crawler of AI_CRAWLERS) {
      expect(result.ai_crawler_status[crawler]).toBe("NO_ROBOTS_TXT");
    }
  });
});
