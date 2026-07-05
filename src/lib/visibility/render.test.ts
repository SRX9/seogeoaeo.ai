import { describe, expect, it } from "vitest";
import { compareRenderedContent } from "./render";
import type { ScrapeFn, ScrapeResult } from "./scrape";
import type { PageSnapshot } from "./types";

function snapshot(word_count: number): PageSnapshot {
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
    word_count,
    text_content: "",
    internal_links: [],
    external_links: [],
    images: [],
    structured_data: [],
    has_ssr_content: true,
    security_headers: {},
    errors: [],
    html: "<html><body></body></html>",
  };
}

const scraped = (wordCount: number): ScrapeResult => ({
  provider: "context",
  markdown: "x",
  html: null,
  wordCount,
  title: null,
  description: null,
  canonical: null,
  jsonLd: [],
  links: [],
});
const scrapeWith = (n: number): ScrapeFn => async () => scraped(n);

describe("compareRenderedContent", () => {
  it("flags severe client-side rendering when the raw HTML is nearly empty", async () => {
    const r = await compareRenderedContent(snapshot(100), { scrape: scrapeWith(1000) });
    expect(r.available).toBe(true);
    expect(r.rendered_word_count).toBe(1000);
    expect(r.ratio).toBe(0.1);
    expect(r.missing_content).toBe(true);
    expect(r.severe).toBe(true);
  });

  it("flags a moderate gap as missing but not severe", async () => {
    const r = await compareRenderedContent(snapshot(400), { scrape: scrapeWith(800) });
    expect(r.missing_content).toBe(true); // ratio 0.5 < 0.7
    expect(r.severe).toBe(false); // ratio 0.5 >= 0.3
  });

  it("does not flag when the raw HTML already contains the rendered content", async () => {
    const r = await compareRenderedContent(snapshot(500), { scrape: scrapeWith(520) });
    expect(r.available).toBe(true);
    expect(r.missing_content).toBe(false);
    expect(r.severe).toBe(false);
  });

  it("never flags a genuinely thin rendered page (<200 words)", async () => {
    const r = await compareRenderedContent(snapshot(20), { scrape: scrapeWith(100) });
    expect(r.available).toBe(true);
    expect(r.missing_content).toBe(false);
    expect(r.severe).toBe(false);
  });

  it("reports unavailable when no scraper is configured (returns null)", async () => {
    const r = await compareRenderedContent(snapshot(500), { scrape: async () => null });
    expect(r.available).toBe(false);
    expect(r.rendered_word_count).toBeNull();
    expect(r.missing_content).toBe(false);
  });

  it("reports unavailable (never throws) when the scraper throws", async () => {
    const r = await compareRenderedContent(snapshot(500), {
      scrape: async () => {
        throw new Error("scraper down");
      },
    });
    expect(r.available).toBe(false);
  });
});
