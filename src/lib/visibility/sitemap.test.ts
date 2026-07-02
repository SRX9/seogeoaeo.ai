import { describe, expect, it } from "vitest";
import { crawlSitemap } from "./sitemap";

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://acme.example/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://acme.example/sitemap-posts.xml</loc></sitemap>
</sitemapindex>`;

function urlset(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
}

function mockFetch(routes: Record<string, string>): typeof fetch {
  return async (input) => {
    const body = routes[String(input)];
    return body !== undefined
      ? new Response(body, { status: 200 })
      : new Response("not found", { status: 404 });
  };
}

describe("crawlSitemap", () => {
  it("discovers pages from a plain sitemap", async () => {
    const pages = await crawlSitemap("https://acme.example/", 50, {
      fetchImpl: mockFetch({
        "https://acme.example/sitemap.xml": urlset([
          "https://acme.example/",
          "https://acme.example/pricing",
        ]),
      }),
    });
    expect(pages.sort()).toEqual([
      "https://acme.example/",
      "https://acme.example/pricing",
    ]);
  });

  it("recurses into a sitemap index and dedupes", async () => {
    const pages = await crawlSitemap("https://acme.example/", 50, {
      fetchImpl: mockFetch({
        "https://acme.example/sitemap.xml": SITEMAP_INDEX,
        "https://acme.example/sitemap-pages.xml": urlset([
          "https://acme.example/",
          "https://acme.example/about",
        ]),
        "https://acme.example/sitemap-posts.xml": urlset([
          "https://acme.example/about",
          "https://acme.example/blog/post-1",
        ]),
      }),
    });
    expect(pages.sort()).toEqual([
      "https://acme.example/",
      "https://acme.example/about",
      "https://acme.example/blog/post-1",
    ]);
  });

  it("caps discovery at max", async () => {
    const many = Array.from({ length: 80 }, (_, i) => `https://acme.example/p/${i}`);
    const pages = await crawlSitemap("https://acme.example/", 50, {
      fetchImpl: mockFetch({ "https://acme.example/sitemap.xml": urlset(many) }),
    });
    expect(pages).toHaveLength(50);
  });

  it("falls back to sitemap_index.xml when sitemap.xml is missing", async () => {
    const pages = await crawlSitemap("https://acme.example/", 50, {
      fetchImpl: mockFetch({
        "https://acme.example/sitemap_index.xml": urlset(["https://acme.example/only"]),
      }),
    });
    expect(pages).toEqual(["https://acme.example/only"]);
  });

  it("returns empty when nothing exists", async () => {
    const pages = await crawlSitemap("https://acme.example/", 50, {
      fetchImpl: mockFetch({}),
    });
    expect(pages).toEqual([]);
  });
});
