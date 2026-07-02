import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "../types";
import { generateSchema, type SchemaFix } from "./generate";
import type { SameAsEntry, SchemaPresence } from "./score";

function snap(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://acme.example/",
    status_code: 200,
    redirect_chain: [],
    headers: {},
    meta_tags: {},
    title: "Acme Analytics | Product analytics",
    description: "Product analytics for busy teams.",
    canonical: null,
    h1_tags: ["Product analytics"],
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

const NONE: SchemaPresence = {
  organization: false,
  localBusiness: false,
  person: false,
  article: false,
  website: false,
  speakable: false,
  breadcrumb: false,
};

const noSameAs: SameAsEntry[] = [];

const find = (fixes: SchemaFix[], schema: string) => fixes.find((f) => f.schema === schema);
const roundtrips = (o: object) => expect(() => JSON.parse(JSON.stringify(o))).not.toThrow();

describe("generateSchema", () => {
  it("emits Organization + WebSite for a bare site, all valid JSON-LD", () => {
    const fixes = generateSchema({ present: NONE, sameAsAudit: noSameAs, types: [], businessType: "saas", snapshot: snap() });
    const org = find(fixes, "Organization")!;
    expect(org).toBeTruthy();
    roundtrips(org.jsonLd);
    const j = org.jsonLd as Record<string, unknown>;
    expect(j["@context"]).toBe("https://schema.org");
    expect(j.name).toBe("Acme Analytics");
    expect(Array.isArray(j.sameAs)).toBe(true);
    // Missing priority platforms use the [REPLACE: …] convention.
    expect((j.sameAs as string[]).some((s) => s.startsWith("[REPLACE:"))).toBe(true);
    expect(find(fixes, "WebSite")).toBeTruthy();
  });

  it("emits SoftwareApplication for SaaS and LocalBusiness for local", () => {
    const saas = generateSchema({ present: NONE, sameAsAudit: noSameAs, types: [], businessType: "saas", snapshot: snap() });
    expect(find(saas, "SoftwareApplication")).toBeTruthy();

    const local = generateSchema({ present: NONE, sameAsAudit: noSameAs, types: [], businessType: "local", snapshot: snap() });
    expect(find(local, "LocalBusiness")).toBeTruthy();
    expect(find(local, "Organization")).toBeFalsy();
  });

  it("Article template has a Person author, dateModified, and speakable", () => {
    const fixes = generateSchema({ present: NONE, sameAsAudit: noSameAs, types: [], businessType: "publisher", snapshot: snap() });
    const article = find(fixes, "Article")!;
    const j = article.jsonLd as Record<string, any>;
    expect(j.author["@type"]).toBe("Person");
    expect(j.dateModified).toBeTruthy();
    expect(j.speakable["@type"]).toBe("SpeakableSpecification");
  });

  it("builds FAQPage from question-style headings", () => {
    const html =
      "<html><body><h2>What is GEO?</h2><p>" +
      "GEO is the practice of optimizing your content so that AI assistants like ChatGPT and " +
      "Perplexity reliably surface, quote, and cite it when they answer real user questions.</p>" +
      "<h2>Why does it matter?</h2><p>" +
      "AI answers increasingly replace classic search results, so being cited by assistants drives " +
      "discovery, brand awareness, and qualified traffic back to your website over the long term.</p></body></html>";
    const fixes = generateSchema({ present: NONE, sameAsAudit: noSameAs, types: [], businessType: "publisher", snapshot: snap({ html }) });
    const faq = find(fixes, "FAQPage")!;
    const j = faq.jsonLd as Record<string, any>;
    expect(j.mainEntity).toHaveLength(2);
    expect(j.mainEntity[0].name).toBe("What is GEO?");
    expect(j.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
  });
});
