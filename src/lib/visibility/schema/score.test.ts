import { describe, expect, it } from "vitest";
import type { PageSnapshot } from "../types";
import { detectSchema } from "./detect";
import { scoreSchema } from "./score";
import { validateSchema } from "./validate";

function snap(structured_data: unknown[]): PageSnapshot {
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
    structured_data,
    has_ssr_content: true,
    security_headers: {},
    errors: [],
    html: "<html><body></body></html>",
  };
}

const run = (sd: unknown[]) => scoreSchema(validateSchema(detectSchema(snap(sd)).blocks));

const FULL = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Acme Inc",
    url: "https://acme.example",
    logo: "https://acme.example/logo.png",
    sameAs: [
      "https://en.wikipedia.org/wiki/Acme",
      "https://www.linkedin.com/company/acme",
      "https://www.youtube.com/@acme",
      "https://www.crunchbase.com/organization/acme",
      "https://twitter.com/acme",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "How AI cites content",
    image: "https://acme.example/a.jpg",
    datePublished: "2026-01-01",
    dateModified: "2026-02-01",
    author: { "@type": "Person", name: "Jane Doe", url: "https://acme.example/jane" },
    speakable: { "@type": "SpeakableSpecification", cssSelector: [".summary"] },
  },
  {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Jane Doe",
    url: "https://acme.example/jane",
    sameAs: ["https://www.linkedin.com/in/janedoe"],
    jobTitle: "Head of Research",
    knowsAbout: ["GEO", "SEO"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: "https://acme.example",
    potentialAction: { "@type": "SearchAction", target: "https://acme.example/s?q={q}", "query-input": "required name=q" },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://acme.example" }],
  },
];

describe("scoreSchema", () => {
  it("scores a complete graph (sameAs 5 incl. Wikipedia) at 100 with the exact breakdown", () => {
    const r = run(FULL);
    expect(r.breakdown).toEqual({
      organization: 20,
      article: 15,
      person: 15,
      sameAs: 15,
      speakable: 10,
      breadcrumb: 5,
      website: 5,
      noDeprecated: 5,
      jsonLdFormat: 5,
      validation: 5,
    });
    expect(r.score).toBe(100);
    expect(r.sameAsAudit.find((e) => e.platform === "Wikipedia")?.linked).toBe(true);
  });

  it("flags missing Organization when there is no schema", () => {
    const r = run([]);
    expect(r.score).toBe(0);
    expect(r.findings.some((f) => f.title === "No Organization schema" && f.severity === "critical")).toBe(true);
  });

  it("scores present-but-bare Organization at 10 and recommends sameAs", () => {
    const r = run([
      { "@context": "https://schema.org", "@type": "Organization", name: "Acme", url: "https://acme.example", logo: "https://acme.example/l.png" },
    ]);
    expect(r.breakdown.organization).toBe(10);
    expect(r.breakdown.sameAs).toBe(0);
    expect(r.findings.some((f) => f.title.includes("sameAs is incomplete"))).toBe(true);
  });

  it("gives 10 (not 15) for 5+ sameAs without Wikipedia", () => {
    const r = run([
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Acme",
        url: "https://acme.example",
        logo: "https://acme.example/l.png",
        sameAs: [
          "https://www.linkedin.com/company/acme",
          "https://www.youtube.com/@acme",
          "https://twitter.com/acme",
          "https://github.com/acme",
          "https://www.facebook.com/acme",
        ],
      },
    ]);
    expect(r.breakdown.sameAs).toBe(10);
  });
});
