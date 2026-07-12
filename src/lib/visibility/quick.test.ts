import { describe, expect, it } from "vitest";
import { quickSnapshot } from "./quick";

const HOMEPAGE = `<!doctype html><html lang="en"><head>
<title>Acme Analytics: product analytics for busy dev teams</title>
<meta name="description" content="${"d".repeat(155)}">
<link rel="canonical" href="https://acme.example/">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="t"><meta property="og:description" content="d">
<meta property="og:image" content="i"><meta property="og:url" content="u">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="t">
<meta name="twitter:description" content="d"><meta name="twitter:image" content="i">
<script type="application/ld+json">{"@type":"Organization"}</script>
</head><body><main><h1>Acme</h1><p>${"Real server-rendered words. ".repeat(60)}</p>
<a href="/pricing">Pricing</a></main></body></html>`;

const ROBOTS = `User-agent: *\nDisallow:\n\nSitemap: https://acme.example/sitemap.xml\n`;

function siteFetch(overrides: Record<string, Response | (() => Response)> = {}): typeof fetch {
  return async (input) => {
    const url = String(input);
    const path = new URL(url).pathname;
    const override = overrides[path];
    if (override) return typeof override === "function" ? override() : override.clone();
    if (path === "/robots.txt") return new Response(ROBOTS, { status: 200 });
    if (path === "/llms.txt" || path === "/llms-full.txt")
      return new Response("nope", { status: 404 });
    return new Response(HOMEPAGE, { status: 200, headers: { "content-type": "text/html" } });
  };
}

describe("quickSnapshot", () => {
  it("combines the deterministic signals into an estimate with top gaps", async () => {
    const result = await quickSnapshot("https://acme.example/", { fetchImpl: siteFetch() });

    expect(result.estimate).toBe(true);
    expect(result.domain).toBe("acme.example");
    expect(result.signals.crawlerAccess.score).toBe(100);
    expect(result.signals.meta.score).toBe(100);
    expect(result.signals.llmsTxt).toEqual({ exists: false, formatValid: false, score: 0 });
    expect(result.signals.schema.jsonLdCount).toBe(1);
    expect(result.signals.ssr.hasSsrContent).toBe(true);
    // 100*.35 + 100*.25 + 0*.15 + 100*.15 + 100*.10 = 85
    expect(result.score).toBe(85);

    // missing llms.txt is the only gap: and it carries the generated file
    const llmsGap = result.topGaps.find((g) => g.category === "llms_txt");
    expect(llmsGap?.severity).toBe("high");
    expect(llmsGap?.fix_payload).toMatchObject({ kind: "llms_txt" });
    expect(result.topGaps.length).toBeLessThanOrEqual(5);
  });

  it("returns an error result when the homepage is unreachable", async () => {
    const result = await quickSnapshot("https://acme.example/", {
      fetchImpl: siteFetch({ "/": new Response("gone", { status: 500 }) }),
    });
    expect(result.error).toBeTruthy();
    expect(result.score).toBe(0);
  });

  it("flags blocked crawlers and client-side rendering as top gaps", async () => {
    const spa = `<html><head><title>Acme Analytics: product analytics for busy dev teams</title></head>
<body><div id="root"></div><script src="/bundle.js"></script></body></html>`;
    const result = await quickSnapshot("https://acme.example/", {
      fetchImpl: siteFetch({
        "/": new Response(spa, { status: 200 }),
        "/robots.txt": new Response("User-agent: GPTBot\nDisallow: /\n", { status: 200 }),
      }),
    });
    expect(result.signals.ssr.hasSsrContent).toBe(false);
    expect(result.signals.crawlerAccess.blocked).toEqual(["GPTBot"]);
    expect(result.topGaps[0].title).toBe("AI assistants can't read this page");
    expect(result.topGaps.some((g) => g.title.includes("GPTBot"))).toBe(true);
  });
});
