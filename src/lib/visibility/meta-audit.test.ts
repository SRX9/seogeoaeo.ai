import { describe, expect, it } from "vitest";
import { auditMeta } from "./meta-audit";
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

const TITLE_55 = "Acme Analytics — product analytics for busy dev teams"; // 53 chars

function check(result: ReturnType<typeof auditMeta>, tag: string) {
  return result.checks.find((c) => c.tag === tag)!;
}

describe("auditMeta", () => {
  it("flags a missing title as high severity with an h1-derived suggestion", () => {
    const result = auditMeta(snapshot({ h1_tags: ["Product analytics for developers"] }));
    expect(check(result, "title").status).toBe("missing");
    const finding = result.findings.find((f) => f.title === "Missing <title> tag")!;
    expect(finding.severity).toBe("high");
    expect(finding.fix_payload).toMatchObject({
      suggested: "Product analytics for developers",
    });
  });

  it("treats a placeholder title as effectively missing", () => {
    const result = auditMeta(snapshot({ title: "Home" }));
    expect(check(result, "title").status).toBe("missing");
    expect(result.findings.some((f) => f.title.includes("placeholder"))).toBe(true);
  });

  it("flags an over-length description", () => {
    const result = auditMeta(snapshot({ title: TITLE_55, description: "x".repeat(200) }));
    expect(check(result, "description").status).toBe("issue");
    expect(
      result.findings.some((f) => f.title === "Meta description exceeds 160 characters"),
    ).toBe(true);
  });

  it("flags noindex (meta or X-Robots-Tag) as high severity", () => {
    const viaMeta = auditMeta(snapshot({ meta_tags: { robots: "noindex, follow" } }));
    expect(viaMeta.findings.some((f) => f.title === "Page is set to noindex")).toBe(true);

    const viaHeader = auditMeta(snapshot({ headers: { "x-robots-tag": "noindex" } }));
    expect(viaHeader.findings.find((f) => f.title === "Page is set to noindex")?.severity).toBe(
      "high",
    );
  });

  it("suggests derivable fixes for canonical and viewport", () => {
    const result = auditMeta(snapshot());
    const canonical = result.findings.find((f) => f.title === "Missing canonical link")!;
    expect(canonical.fix_payload).toMatchObject({ suggested: "https://acme.example/" });
    const viewport = result.findings.find((f) => f.title === "Missing viewport tag")!;
    expect(viewport.fix_payload).toMatchObject({
      suggested: "width=device-width, initial-scale=1",
    });
  });

  it("reports partial Open Graph / Twitter sets with derived suggestions", () => {
    const result = auditMeta(
      snapshot({
        title: TITLE_55,
        description: "d".repeat(155),
        meta_tags: { "og:title": "Acme", viewport: "width=device-width, initial-scale=1" },
      }),
    );
    expect(check(result, "open_graph").status).toBe("issue");
    const og = result.findings.find((f) => f.title === "Incomplete Open Graph tags")!;
    expect(og.fix_payload).toMatchObject({
      suggested: { "og:title": "Acme", "og:type": "website" },
    });
    expect(check(result, "twitter_card").status).toBe("missing");
  });

  it("passes a fully-tagged page with a clean score", () => {
    const result = auditMeta(
      snapshot({
        title: TITLE_55,
        description: "d".repeat(155),
        canonical: "https://acme.example/",
        meta_tags: {
          viewport: "width=device-width, initial-scale=1",
          "og:title": "t",
          "og:description": "d",
          "og:image": "i",
          "og:url": "u",
          "og:type": "website",
          "twitter:card": "summary_large_image",
          "twitter:title": "t",
          "twitter:description": "d",
          "twitter:image": "i",
        },
        html: '<html lang="en"><body></body></html>',
      }),
    );
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(100);
    expect(result.checks.every((c) => c.status !== "missing" || c.tag === "hreflang")).toBe(true);
  });
});
