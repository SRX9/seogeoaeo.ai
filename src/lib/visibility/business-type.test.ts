import { describe, expect, it } from "vitest";
import {
  classifyBusinessType,
  detectBusinessType,
  recommendationProfile,
} from "./business-type";
import type { PageSnapshot } from "./types";

function snapshot(overrides: Partial<PageSnapshot>): PageSnapshot {
  return {
    url: "https://example.com/",
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
    html: "",
    ...overrides,
  };
}

describe("detectBusinessType", () => {
  it("detects SaaS", () => {
    const result = detectBusinessType(
      snapshot({
        text_content: "Start your free trial today. Sign up in minutes. Simple pricing.",
        internal_links: [
          { url: "https://example.com/pricing", text: "Pricing" },
          { url: "https://example.com/docs", text: "API Docs" },
          { url: "https://example.com/dashboard", text: "Dashboard" },
        ],
      }),
    );
    expect(result.type).toBe("saas");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("detects Local", () => {
    const result = detectBusinessType(
      snapshot({
        text_content:
          "Call us at (555) 123-4567. Visit our shop at 42 Main Street. Plumbers near me? Our service area covers the whole county.",
        html: '<iframe src="https://www.google.com/maps/embed?pb=..."></iframe>',
        structured_data: [{ "@type": "LocalBusiness", address: { "@type": "PostalAddress" } }],
      }),
    );
    expect(result.type).toBe("local");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("detects E-commerce", () => {
    const result = detectBusinessType(
      snapshot({
        text_content: "Add to cart: $49.99. Fast checkout and free shipping.",
        internal_links: [{ url: "https://example.com/product/blue-shirt", text: "Blue Shirt" }],
        structured_data: [{ "@type": "Product", name: "Blue Shirt" }],
      }),
    );
    expect(result.type).toBe("ecommerce");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("detects Publisher", () => {
    const result = detectBusinessType(
      snapshot({
        text_content: "Read the latest articles on our blog. Written by jane doe.",
        internal_links: [{ url: "https://example.com/blog/some-post", text: "Some post" }],
        meta_tags: { author: "Jane Doe", "article:published_time": "2026-01-01" },
        structured_data: [{ "@type": "NewsArticle" }],
        html: "<time datetime='2026-01-01'>Jan 1</time>",
      }),
    );
    expect(result.type).toBe("publisher");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("detects Agency", () => {
    const result = detectBusinessType(
      snapshot({
        text_content:
          "Explore our portfolio and case studies. Our services span brand and web. Trusted by 200 clients. Read a testimonial.",
        internal_links: [{ url: "https://example.com/services", text: "Our services" }],
      }),
    );
    expect(result.type).toBe("agency");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("defaults to Other with zero confidence when nothing matches", () => {
    const result = detectBusinessType(
      snapshot({ text_content: "Welcome to my personal homepage about ferns." }),
    );
    expect(result.type).toBe("other");
    expect(result.confidence).toBe(0);
  });
});

describe("classifyBusinessType", () => {
  it("returns the deterministic result without an LLM call when confident", async () => {
    const result = await classifyBusinessType(
      snapshot({
        text_content: "Free trial. Sign up. Pricing.",
        internal_links: [
          { url: "https://example.com/pricing", text: "Pricing" },
          { url: "https://example.com/app", text: "App" },
        ],
      }),
    );
    expect(result.type).toBe("saas");
  });

  it("falls back to the deterministic result when the LLM is unavailable", async () => {
    // LLM env is not configured in tests: the fallback must not throw.
    const result = await classifyBusinessType(
      snapshot({ text_content: "Nothing identifiable here." }),
    );
    expect(result.type).toBe("other");
  });
});

describe("recommendationProfile", () => {
  it("maps types to schema + priorities", () => {
    expect(recommendationProfile("local").schemaTypes).toContain("LocalBusiness");
    expect(recommendationProfile("local").priorities.join(" ")).toContain("Google Business Profile");
    expect(recommendationProfile("saas").schemaTypes).toContain("SoftwareApplication");
    expect(recommendationProfile("ecommerce").schemaTypes).toContain("Product");
    expect(recommendationProfile("publisher").schemaTypes).toContain("Article");
    expect(recommendationProfile("agency").schemaTypes).toContain("Service");
    expect(recommendationProfile("other").schemaTypes).toContain("Organization");
  });
});
