import { describe, expect, it } from "vitest";
import {
  analyzeFreshness,
  analyzeReadability,
  analyzeTopicalAuthority,
  computeContentScore,
  detectAiContent,
  heuristicEeat,
} from "./content";
import type { HeadingEntry, LinkEntry, PageSnapshot } from "./types";

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
    word_count: 0,
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
const heads = (...levels: number[]): HeadingEntry[] => levels.map((level) => ({ level, text: "H" }));
const links = (n: number, base = "https://acme.example/p"): LinkEntry[] =>
  Array.from({ length: n }, (_, i) => ({ url: `${base}${i}`, text: `link ${i}` }));

describe("analyzeReadability", () => {
  it("flags thin content and computes a word-count tier", () => {
    const r = analyzeReadability(snapshot({ word_count: 120, heading_structure: heads(1) }));
    expect(r.tier).toBe("thin");
    expect(r.findings.some((f) => f.title.startsWith("Thin content"))).toBe(true);
  });

  it("detects skipped heading levels and missing/duplicate H1", () => {
    const r = analyzeReadability(snapshot({ word_count: 900, heading_structure: heads(1, 3) }));
    expect(r.headings.skippedLevels).toBe(true);
    const dup = analyzeReadability(snapshot({ word_count: 900, heading_structure: heads(1, 1) }));
    expect(dup.headings.h1Count).toBe(2);
    expect(dup.findings.some((f) => f.title.includes("Multiple H1"))).toBe(true);
  });

  it("produces a Flesch score in range with a level label", () => {
    const html = `<html><body>${"<p>The cat sat on the mat. The dog ran in the park. We had a lot of fun today.</p>".repeat(3)}</body></html>`;
    const r = analyzeReadability(snapshot({ word_count: 900, html, heading_structure: heads(1, 2, 2) }));
    expect(r.flesch).toBeGreaterThan(0);
    expect(r.flesch).toBeLessThanOrEqual(100);
    expect(typeof r.fleschLevel).toBe("string");
  });
});

describe("analyzeFreshness", () => {
  const now = new Date("2026-07-02");
  it("flags stale time-sensitive content", () => {
    const r = analyzeFreshness(
      snapshot({
        meta_tags: { "article:modified_time": "2023-01-01" },
        title: "Best CRM software 2024",
        text_content: "This guide covers the latest CRM software version 3 and pricing trends.",
        word_count: 500,
      }),
      now,
    );
    expect(r.stale).toBe(true);
    expect(r.refreshCandidate).not.toBeNull();
    expect(r.findings.some((f) => f.category === "freshness")).toBe(true);
  });

  it("does not flag an evergreen page of the same age", () => {
    const r = analyzeFreshness(
      snapshot({
        meta_tags: { "article:modified_time": "2023-01-01" },
        title: "How to tie a bowline knot",
        text_content: "A simple, timeless method for tying a strong loop that holds under load.",
        word_count: 500,
      }),
      now,
    );
    expect(r.timeSensitivity).toBe("low");
    expect(r.stale).toBe(false);
  });
});

describe("analyzeTopicalAuthority", () => {
  it("awards the +10 modifier to a deep, well-linked site", () => {
    const r = analyzeTopicalAuthority(snapshot({ internal_links: links(15) }), links(25).map((l) => l.url));
    expect(r.modifier).toBe(10);
    expect(r.rating).toBe("strong");
  });

  it("applies −5 and flags a shallow 3-page site", () => {
    const r = analyzeTopicalAuthority(snapshot({ internal_links: links(2) }), links(3).map((l) => l.url));
    expect(r.modifier).toBe(-5);
    expect(r.findings.some((f) => f.category === "topical_authority")).toBe(true);
  });
});

describe("detectAiContent", () => {
  it("labels generic, hedging, specific-free prose as Likely Unedited AI", () => {
    const para =
      "In today's digital landscape it is important to note that businesses must delve into strategy. " +
      "Generally this may help and it might work. Typically results can vary and it depends on many factors. " +
      "Organizations should consider the ever-evolving nature of the market and adapt accordingly over time. ";
    const text = para.repeat(8); // >300 words, no specifics, no first-person voice
    const r = detectAiContent(snapshot({ text_content: text, word_count: text.split(/\s+/).filter(Boolean).length }));
    expect(r.label).toBe("Likely Unedited AI");
    expect(r.redFlags.length).toBeGreaterThanOrEqual(4);
  });

  it("labels specific, first-person, data-rich prose as Highly Likely Human", () => {
    const text =
      "In 2024 our team ran an experiment in New York. We found that 42% of readers preferred the new layout. " +
      "I rebuilt the onboarding flow myself and measured a 3,200 user lift over eight weeks of testing.";
    const r = detectAiContent(snapshot({ text_content: text, word_count: text.split(/\s+/).length }));
    expect(r.label).toBe("Highly Likely Human");
  });
});

describe("heuristicEeat", () => {
  it("scores a trustworthy, authored, sourced page far above an anonymous thin page", () => {
    const rich = heuristicEeat(
      snapshot({
        url: "https://acme.example/guide",
        meta_tags: { author: "Jane Doe", "article:published_time": "2026-01-01" },
        text_content: "In 2024 our research found that we measured a 42% lift. Contact us at hi@acme.example.",
        internal_links: [
          { url: "https://acme.example/about", text: "About" },
          { url: "https://acme.example/privacy", text: "Privacy" },
        ],
        external_links: links(4, "https://nytimes.com/a"),
        structured_data: [{ "@type": "Person", name: "Jane Doe" }],
        word_count: 1200,
      }),
    );
    const thin = heuristicEeat(snapshot({ url: "http://acme.example/", text_content: "Welcome to our site.", word_count: 50 }));
    expect(rich.total).toBeGreaterThan(thin.total);
    expect(rich.trustworthiness.score).toBeGreaterThan(thin.trustworthiness.score);
  });
});

describe("computeContentScore", () => {
  it("weights the components to a max of 100", () => {
    expect(
      computeContentScore({ eeatTotal: 100, contentMetrics: 100, aiContent: 100, topicalModifier: 10, freshness: 100 }),
    ).toBe(100);
    expect(
      computeContentScore({ eeatTotal: 0, contentMetrics: 0, aiContent: 0, topicalModifier: -5, freshness: 0 }),
    ).toBe(0);
  });
});
