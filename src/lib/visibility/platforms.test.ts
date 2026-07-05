import { describe, expect, it } from "vitest";
import type { BrandResult } from "./brand";
import { analyzePlatforms } from "./platforms";
import type { PageSnapshot } from "./types";

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://acme.example/",
    status_code: 200,
    redirect_chain: [],
    headers: {},
    meta_tags: {},
    title: null,
    description: null,
    canonical: null,
    h1_tags: [],
    heading_structure: [],
    word_count: 500,
    text_content: "",
    internal_links: [],
    external_links: [],
    images: [],
    structured_data: [],
    has_ssr_content: true,
    security_headers: {},
    errors: [],
    html: "<html><body></body></html>",
    ...overrides,
  };
}

function brand(over: Partial<{ wiki: boolean; wikidata: boolean; youtube: boolean; reddit: boolean; linkedin: boolean; industry: boolean; score: number }> = {}): BrandResult {
  const p = (platform: string, detected: boolean) => ({ platform, detected, weight: 0, earned: 0, searchUrl: "" });
  return {
    brandName: "Acme",
    domain: null,
    score: over.score ?? 60,
    limitedData: false,
    wikipedia: { hasPage: over.wiki ?? false, searchResults: 0 },
    wikidata: { hasEntry: over.wikidata ?? false, id: null, description: null },
    platforms: [
      p("Wikipedia", over.wiki ?? false),
      p("Reddit", over.reddit ?? false),
      p("YouTube", over.youtube ?? false),
      p("LinkedIn", over.linkedin ?? false),
      p("Industry & niche", over.industry ?? false),
    ],
    recommendations: [],
    findings: [],
  };
}

const sig = (over: Partial<Parameters<typeof analyzePlatforms>[0]>) => ({
  snapshot: snapshot(),
  brand: brand(),
  citabilityScore: 50,
  crawlerScore: 80,
  freshnessScore: 100,
  ...over,
});

describe("analyzePlatforms", () => {
  it("scores all five engines with the exact sub-score keys", () => {
    const r = analyzePlatforms(sig({}));
    expect(r.platforms.map((p) => p.platform)).toEqual([
      "Google AI Overviews",
      "ChatGPT",
      "Perplexity",
      "Gemini",
      "Bing Copilot",
    ]);
    expect(Object.keys(r.platforms[1].breakdown)).toEqual(["entity_recognition", "content", "crawler_access"]);
    expect(r.average).toBe(Math.round(r.platforms.reduce((s, p) => s + p.score, 0) / 5));
  });

  it("a Wikipedia entity boosts ChatGPT and Gemini", () => {
    const withWiki = analyzePlatforms(sig({ brand: brand({ wiki: true, wikidata: true }) }));
    const without = analyzePlatforms(sig({ brand: brand({ wiki: false, wikidata: false }) }));
    const cg = (r: typeof withWiki) => r.platforms.find((p) => p.platform === "ChatGPT")!.score;
    const gm = (r: typeof withWiki) => r.platforms.find((p) => p.platform === "Gemini")!.score;
    expect(cg(withWiki)).toBeGreaterThan(cg(without));
    expect(gm(withWiki)).toBeGreaterThan(gm(without));
    expect(withWiki.synergies.some((s) => s.includes("Wikipedia"))).toBe(true);
  });

  it("reports strongest/weakest and a quick win per engine", () => {
    const r = analyzePlatforms(sig({ brand: brand({ youtube: true, wiki: true }) }));
    expect(r.strongest).toBeTruthy();
    expect(r.weakest).toBeTruthy();
    expect(r.platforms.every((p) => p.quickWin.length > 0)).toBe(true);
  });
});
