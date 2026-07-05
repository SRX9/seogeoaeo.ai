import { describe, expect, it } from "vitest";
import { assessAdequacy, fetchPageResilient, isChallengePage } from "./resilient-fetch";
import type { ScrapeFn, ScrapeResult } from "./scrape";
import type { PageSnapshot } from "./types";

const htmlResponse = (html: string, status = 200): typeof fetch =>
  (async () => new Response(html, { status, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;

const scrape = (over: Partial<ScrapeResult> = {}): ScrapeFn => async () => ({
  provider: "context",
  markdown:
    "## Product analytics\n\nAcme Analytics is a product analytics platform that helps engineering teams track activation, retention, and conversion across their product every single day.",
  html: null,
  wordCount: 400,
  title: "Acme Analytics",
  description: "Product analytics for teams",
  canonical: "https://acme.example/",
  jsonLd: [{ "@type": "Organization", name: "Acme" }],
  links: [],
  ...over,
});

function snapshot(over: Partial<PageSnapshot> = {}): PageSnapshot {
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
    ...over,
  };
}

const CHALLENGE_HTML = "<html><body><h1>Just a moment...</h1><p>Checking your browser before accessing.</p></body></html>";
const RICH_HTML = `<html><head><title>Acme</title></head><body>${"<p>Acme helps engineering teams ship analytics faster and measure what matters across the product.</p>".repeat(12)}</body></html>`;

describe("isChallengePage", () => {
  it("detects a Cloudflare-style interstitial", () => {
    expect(isChallengePage(snapshot({ html: CHALLENGE_HTML, word_count: 12 }))).toBe(true);
  });
  it("detects a cf-mitigated response header", () => {
    expect(isChallengePage(snapshot({ headers: { "cf-mitigated": "challenge" }, word_count: 5 }))).toBe(true);
  });
  it("does not flag a real content page", () => {
    expect(isChallengePage(snapshot({ html: RICH_HTML, word_count: 600 }))).toBe(false);
  });
});

describe("assessAdequacy", () => {
  it("ok for a healthy 200 with content", () => {
    expect(assessAdequacy(snapshot({ status_code: 200, word_count: 500, has_ssr_content: true }))).toBe("ok");
  });
  it("blocked for 403 / null / challenge", () => {
    expect(assessAdequacy(snapshot({ status_code: 403 }))).toBe("blocked");
    expect(assessAdequacy(snapshot({ status_code: null }))).toBe("blocked");
    expect(assessAdequacy(snapshot({ status_code: 200, html: CHALLENGE_HTML, word_count: 12 }))).toBe("blocked");
  });
  it("thin for a client-rendered / near-empty 200", () => {
    expect(assessAdequacy(snapshot({ status_code: 200, has_ssr_content: false, word_count: 20 }))).toBe("thin");
    expect(assessAdequacy(snapshot({ status_code: 200, word_count: 40 }))).toBe("thin");
  });
});

describe("fetchPageResilient", () => {
  it("returns the raw page and runs the SSR check on a healthy site", async () => {
    const res = await fetchPageResilient("https://acme.example/", {
      fetchImpl: htmlResponse(RICH_HTML),
      scrapeImpl: scrape({ wordCount: 60 }), // similar to raw → no missing content
    });
    expect(res.recovered).toBe(false);
    expect(res.blocked).toBe(false);
    expect(res.render.available).toBe(true);
    expect(res.render.missing_content).toBe(false);
  });

  it("recovers real content when the raw fetch is bot-blocked (403)", async () => {
    const res = await fetchPageResilient("https://acme.example/", {
      fetchImpl: htmlResponse(CHALLENGE_HTML, 403),
      scrapeImpl: scrape(),
    });
    expect(res.blocked).toBe(true);
    expect(res.recovered).toBe(true);
    expect(res.snapshot.word_count).toBeGreaterThan(20);
    expect(res.snapshot.title).toBe("Acme Analytics");
    expect(res.snapshot.structured_data).toEqual([{ "@type": "Organization", name: "Acme" }]);
    expect(res.snapshot.errors.some((e) => e.includes("recovered via context"))).toBe(true);
    // SSR is NOT diagnosed off a challenge page.
    expect(res.render.available).toBe(false);
  });

  it("recovers content AND diagnoses SSR for a client-rendered 200", async () => {
    const csrShell = '<html><body><div id="root"></div></body></html>';
    const res = await fetchPageResilient("https://acme.example/", {
      fetchImpl: htmlResponse(csrShell),
      scrapeImpl: scrape({ wordCount: 800 }),
    });
    expect(res.recovered).toBe(true);
    expect(res.blocked).toBe(false);
    expect(res.render.available).toBe(true);
    expect(res.render.missing_content).toBe(true); // raw ~empty, render 800 words
    expect(res.snapshot.has_ssr_content).toBe(false);
  });

  it("returns the raw page (recovered=false) when no scraper is configured", async () => {
    const res = await fetchPageResilient("https://acme.example/", {
      fetchImpl: htmlResponse(CHALLENGE_HTML, 403),
      scrapeImpl: async () => null,
    });
    expect(res.recovered).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.snapshot.errors.some((e) => e.includes("blocked by bot protection"))).toBe(true);
  });
});
