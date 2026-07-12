import { describe, expect, it } from "vitest";
import type { SerperResult, serperSearch } from "@/lib/research/serper";
import { gatherOffsiteSignals } from "./offsite";

// Reddit fetch mock: returns the given status + JSON body regardless of URL.
const redditFetch = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

// Serper mock keyed by an unambiguous token in the query (youtube.com / reddit.com / -site:).
const serper = (byToken: Record<string, Partial<SerperResult>>): typeof serperSearch =>
  (async (query: string) => {
    for (const [token, result] of Object.entries(byToken)) {
      if (query.includes(token)) return { organic: [], peopleAlsoAsk: [], knowledgeGraph: null, ...result };
    }
    return { organic: [], peopleAlsoAsk: [], knowledgeGraph: null };
  }) as typeof serperSearch;

const emptySerper: typeof serperSearch = (async () => ({
  organic: [],
  peopleAlsoAsk: [],
  knowledgeGraph: null,
})) as typeof serperSearch;

describe("gatherOffsiteSignals", () => {
  it("parses Reddit JSON: mention count, 365-day recency window, distinct subreddits", async () => {
    const now = new Date("2026-07-04T00:00:00Z");
    const nowSec = Math.floor(now.getTime() / 1000);
    const body = {
      data: {
        children: [
          { data: { subreddit: "SaaS", created_utc: nowSec - 10 * 86400 } },
          { data: { subreddit: "SaaS", created_utc: nowSec - 20 * 86400 } },
          { data: { subreddit: "startups", created_utc: nowSec - 400 * 86400 } }, // outside 1y
        ],
      },
    };
    const r = await gatherOffsiteSignals("Acme", "acme.example", {
      fetchImpl: redditFetch(200, body),
      serperImpl: emptySerper,
      now,
      noCache: true,
    });
    expect(r.reddit).toEqual({ mentions: 3, recentMentions: 2, subreddits: 2, source: "api" });
  });

  it("falls back to Serper site-search when Reddit returns 403", async () => {
    const serperImpl = serper({
      "reddit.com": {
        organic: [
          { link: "https://www.reddit.com/r/SaaS/comments/1/acme" },
          { link: "https://www.reddit.com/r/startups/comments/2/acme" },
        ],
      },
    });
    const r = await gatherOffsiteSignals("Acme", null, {
      fetchImpl: redditFetch(403, {}),
      serperImpl,
      now: new Date(),
      noCache: true,
    });
    expect(r.reddit).toEqual({ mentions: 2, recentMentions: 2, subreddits: 2, source: "serper" });
  });

  it("returns nulls + limitedData when no source responds", async () => {
    const r = await gatherOffsiteSignals("Acme", null, {
      fetchImpl: redditFetch(403, {}),
      serperImpl: emptySerper,
      now: new Date(),
      noCache: true,
    });
    expect(r.reddit).toBeNull();
    expect(r.youtube).toBeNull();
    expect(r.web).toBeNull();
    expect(r.limitedData).toBe(true);
  });

  it("detects an official YouTube channel and third-party web mentions", async () => {
    const serperImpl = serper({
      "youtube.com": {
        organic: [
          { link: "https://www.youtube.com/@acme", title: "Acme Official Channel" },
          { link: "https://www.youtube.com/watch?v=1", title: "Acme review" },
        ],
      },
      "-site:": {
        organic: [
          { link: "https://techcrunch.com/acme" },
          { link: "https://www.linkedin.com/company/acme" },
          { link: "https://acme.example/blog" }, // own domain: excluded from third-party count
        ],
        knowledgeGraph: { title: "Acme" },
      },
    });
    const r = await gatherOffsiteSignals("Acme", "acme.example", {
      fetchImpl: redditFetch(200, { data: { children: [] } }),
      serperImpl,
      now: new Date(),
      noCache: true,
    });
    expect(r.youtube).toEqual({ officialChannel: true, videoMentions: 2 });
    expect(r.web).toEqual({ thirdPartyMentions: 2, knowledgeGraph: true, linkedinCompany: true });
    expect(r.reddit).toEqual({ mentions: 0, recentMentions: 0, subreddits: 0, source: "api" });
    expect(r.limitedData).toBe(false);
  });

  it("does not credit a knowledge graph whose title is a different entity", async () => {
    const serperImpl = serper({
      "-site:": { organic: [{ link: "https://example.org/x" }], knowledgeGraph: { title: "Something Else" } },
    });
    const r = await gatherOffsiteSignals("Acme", "acme.example", {
      fetchImpl: redditFetch(200, { data: { children: [] } }),
      serperImpl,
      now: new Date(),
      noCache: true,
    });
    expect(r.web?.knowledgeGraph).toBe(false);
  });
});
