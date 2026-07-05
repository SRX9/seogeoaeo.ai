import { describe, expect, it } from "vitest";
import { auditTechnical, checkAgentReadiness } from "./technical";
import type { PageSnapshot, RobotsResult } from "./types";

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

function robots(overrides: Partial<RobotsResult> = {}): RobotsResult {
  return {
    url: "https://acme.example/robots.txt",
    exists: true,
    content: "",
    agent_rules: {},
    ai_crawler_status: {},
    sitemaps: ["https://acme.example/sitemap.xml"],
    errors: [],
    ...overrides,
  };
}

const ALL_SECURITY = {
  "Strict-Transport-Security": "max-age=31536000",
  "Content-Security-Policy": "default-src 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=()",
};

const IDEAL_HTML =
  '<!doctype html><html lang="en"><head>' +
  '<link rel="stylesheet" href="/s.css" media="all">' +
  '<link rel="preconnect" href="https://cdn.acme.example">' +
  "<style>@media (max-width:600px){body{padding:0}}</style>" +
  '<script id="__NEXT_DATA__" type="application/json">{}</script>' +
  "</head><body>" +
  '<img src="/hero.png" width="800" height="400" srcset="/hero.png 1x" alt="hero">' +
  "<p>Substantial server-rendered content for the audit.</p></body></html>";

function idealSnapshot(): PageSnapshot {
  return snapshot({
    url: "https://acme.example/product/analytics",
    title: "Acme Analytics — product analytics for busy dev teams",
    description: "d".repeat(155),
    canonical: "https://acme.example/product/analytics",
    headers: { "content-encoding": "br", "cache-control": "max-age=3600" },
    security_headers: ALL_SECURITY,
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
    images: [{ src: "/hero.png", alt: "hero", width: "800", height: "400", loading: null }],
    has_ssr_content: true,
    html: IDEAL_HTML,
  });
}

describe("auditTechnical", () => {
  it("category weights sum to 1 (SSR is the heaviest)", () => {
    const r = auditTechnical(snapshot(), robots());
    expect(r.categories.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 10);
    expect(r.categories.find((c) => c.key === "ssr")!.weight).toBe(0.25);
  });

  it("scores a fully-optimized SSR page at 100", () => {
    const r = auditTechnical(idealSnapshot(), robots());
    expect(r.score).toBe(100);
    expect(r.ssr).toMatchObject({ severity: "LOW", framework: "Next.js" });
    expect(r.cwv).toMatchObject({ lcp: "Low", inp: "Low", cls: "Low" });
  });

  it("applies the exact security-header deductions (HTTP + all missing = 32)", () => {
    const r = auditTechnical(
      snapshot({ url: "http://acme.example/", security_headers: {} }),
      robots(),
    );
    expect(r.categories.find((c) => c.key === "security")!.score).toBe(32);
    expect(r.findings.some((f) => f.title === "Site is not served over HTTPS")).toBe(true);
  });

  it("flags CSR (empty body) as a CRITICAL SSR finding scoring 0", () => {
    const r = auditTechnical(
      snapshot({ has_ssr_content: false, html: '<html><body><div id="root"></div></body></html>' }),
      robots(),
    );
    expect(r.ssr.severity).toBe("CRITICAL");
    expect(r.categories.find((c) => c.key === "ssr")!.score).toBe(0);
    expect(
      r.findings.find((f) => f.category === "ssr")?.severity,
    ).toBe("critical");
  });

  it("detects WordPress as server-rendered (LOW)", () => {
    const r = auditTechnical(
      snapshot({ html: '<html><body><link href="/wp-content/x.css"><p>content</p></body></html>' }),
      robots(),
    );
    expect(r.ssr).toMatchObject({ severity: "LOW", framework: "WordPress" });
  });

  it("uses a real render verdict over the static heuristic (missing content → HIGH)", () => {
    // Heuristic alone would say LOW (has_ssr_content true), but the render shows
    // most content is client-injected → HIGH, scoring 40, with a measured finding.
    const r = auditTechnical(snapshot({ has_ssr_content: true }), robots(), [], {
      render: {
        available: true,
        raw_word_count: 120,
        rendered_word_count: 900,
        ratio: 0.13,
        missing_content: true,
        severe: false,
        note: "",
      },
    });
    expect(r.ssr.severity).toBe("HIGH");
    expect(r.categories.find((c) => c.key === "ssr")!.score).toBe(40);
    expect(r.ssr.renderCheck).toEqual({ renderedWordCount: 900, ratio: 0.13 });
    const finding = r.findings.find((f) => f.category === "ssr")!;
    expect(finding.severity).toBe("high");
    expect(finding.recommendation).toContain("900 words");
  });

  it("a render that confirms content clears a framework the heuristic would call CSR", () => {
    // Angular SPA markup would map to MEDIUM by framework heuristic; a good render overrides to LOW.
    const r = auditTechnical(
      snapshot({ html: "<html><body><app-root>rendered</app-root></body></html>" }),
      robots(),
      [],
      {
        render: {
          available: true,
          raw_word_count: 480,
          rendered_word_count: 500,
          ratio: 0.96,
          missing_content: false,
          severe: false,
          note: "",
        },
      },
    );
    expect(r.ssr.severity).toBe("LOW");
    expect(r.findings.some((f) => f.category === "ssr")).toBe(false);
  });

  it("severe client-side rendering from a render → CRITICAL", () => {
    const r = auditTechnical(snapshot({ has_ssr_content: true }), robots(), [], {
      render: { available: true, raw_word_count: 40, rendered_word_count: 900, ratio: 0.04, missing_content: true, severe: true, note: "" },
    });
    expect(r.ssr.severity).toBe("CRITICAL");
  });

  it("falls back to the static heuristic when no render is available (golden parity)", () => {
    const withNoRender = auditTechnical(snapshot({ has_ssr_content: false, html: '<html><body><div id="root"></div></body></html>' }), robots());
    const withUnavailable = auditTechnical(
      snapshot({ has_ssr_content: false, html: '<html><body><div id="root"></div></body></html>' }),
      robots(),
      [],
      { render: { available: false, raw_word_count: 0, rendered_word_count: null, ratio: null, missing_content: false, severe: false, note: "" } },
    );
    expect(withNoRender.ssr.severity).toBe("CRITICAL");
    expect(withUnavailable.ssr.severity).toBe("CRITICAL");
    expect(withNoRender.ssr.renderCheck).toBeUndefined();
  });

  it("penalizes a messy URL (uppercase, underscores, depth, session id)", () => {
    const r = auditTechnical(
      snapshot({ url: "https://acme.example/Path_1/a/b/c/d/e?sid=abc123def456ghij" }),
      robots(),
    );
    expect(r.categories.find((c) => c.key === "url")!.score).toBeLessThan(60);
    expect(r.findings.some((f) => f.category === "url_structure")).toBe(true);
  });
});

describe("checkAgentReadiness (non-scoring, V5.3)", () => {
  const mdFetch = (contentType: string, status = 200): typeof fetch =>
    (async () => new Response("ok", { status, headers: { "content-type": contentType } })) as unknown as typeof fetch;

  it("documents high-value Link header rel types", async () => {
    const r = await checkAgentReadiness(
      snapshot({ headers: { link: '<https://acme.example/.well-known/api-catalog>; rel="api-catalog"' } }),
      { fetchImpl: mdFetch("text/html") },
    );
    expect(r.linkHeaders.present).toBe(true);
    expect(r.linkHeaders.relTypes).toContain("api-catalog");
  });

  it("omits the Link recommendation for a standard business site", async () => {
    const r = await checkAgentReadiness(snapshot(), { fetchImpl: mdFetch("text/html") });
    expect(r.linkHeaders.present).toBe(false);
    expect(r.linkHeaders.recommendation).toBeUndefined();
  });

  it("passes markdown negotiation when text/markdown is served", async () => {
    const r = await checkAgentReadiness(snapshot(), { fetchImpl: mdFetch("text/markdown; charset=utf-8") });
    expect(r.markdown.status).toBe("supported");
  });

  it("recommends markdown when HTML is served, and never penalizes on error", async () => {
    const rec = await checkAgentReadiness(snapshot(), { fetchImpl: mdFetch("text/html") });
    expect(rec.markdown.status).toBe("not-supported");
    expect(rec.markdown.recommendation).toBeTruthy();

    const errFetch = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const err = await checkAgentReadiness(snapshot(), { fetchImpl: errFetch });
    expect(err.markdown.status).toBe("error");
    expect(err.markdown.recommendation).toBeUndefined();
  });
});
