import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "../types";
import { detectSchema } from "./detect";
import { validateSchema } from "./validate";

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

const ORG = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Acme Inc",
  url: "https://acme.example",
  logo: "https://acme.example/logo.png",
  sameAs: ["https://en.wikipedia.org/wiki/Acme", "https://www.linkedin.com/company/acme"],
};

describe("detectSchema", () => {
  it("collects JSON-LD from the snapshot and descends into @graph", () => {
    const graph = { "@context": "https://schema.org", "@graph": [ORG, { "@type": "WebSite", url: "https://acme.example" }] };
    const r = detectSchema(snapshot({ structured_data: [graph] }));
    expect(r.types).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
    expect(r.formats).toEqual(["json-ld"]);
  });

  it("detects Microdata via schema.org itemtype", () => {
    const r = detectSchema(
      snapshot({ html: '<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">X</span></div>' }),
    );
    expect(r.blocks.some((b) => b.format === "microdata" && b.types.includes("Product"))).toBe(true);
  });

  it("flags JS-injection risk on a CSR page with no server schema", () => {
    const r = detectSchema(snapshot({ has_ssr_content: false, structured_data: [] }));
    expect(r.jsInjectionRisk).toBe(true);
  });
});

describe("validateSchema", () => {
  it("passes a complete Organization", () => {
    const [v] = validateSchema(detectSchema(snapshot({ structured_data: [ORG] })).blocks);
    expect(v.valid).toBe(true);
    expect(v.richResultEligible).toBe(true);
    expect(v.missingRequired).toEqual([]);
  });

  it("errors on an Article with a string author", () => {
    const article = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Hi",
      image: "https://acme.example/a.jpg",
      datePublished: "2026-01-01",
      author: "Jane Doe",
    };
    const [v] = validateSchema(detectSchema(snapshot({ structured_data: [article] })).blocks);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes("author should be a Person"))).toBe(true);
  });

  it("flags HowTo as deprecated", () => {
    const [v] = validateSchema(
      detectSchema(snapshot({ structured_data: [{ "@context": "https://schema.org", "@type": "HowTo", name: "x" }] })).blocks,
    );
    expect(v.deprecated).toBe(true);
    expect(v.deprecatedNote).toContain("Sep 2023");
  });

  it("marks FAQPage as restricted (not rich-result eligible)", () => {
    const [v] = validateSchema(
      detectSchema(snapshot({ structured_data: [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] }] })).blocks,
    );
    expect(v.richResultEligible).toBe(false);
    expect(v.deprecated).toBe(true);
  });

  it("reports missing required props and non-ISO dates", () => {
    const bad = { "@context": "https://schema.org", "@type": "Article", headline: "Hi", datePublished: "Jan 1 2026" };
    const [v] = validateSchema(detectSchema(snapshot({ structured_data: [bad] })).blocks);
    expect(v.missingRequired).toEqual(expect.arrayContaining(["image", "author"]));
    expect(v.errors.some((e) => e.includes("ISO-8601"))).toBe(true);
  });
});
