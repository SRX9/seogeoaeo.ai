import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scrapeUrl, scrapeViaContext, scrapeViaFirecrawl, type ScrapeFn, type ScrapeResult } from "./scrape";

const jsonFetch = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const scraper = (result: ScrapeResult | null): ScrapeFn => async () => result;
const result = (over: Partial<ScrapeResult> = {}): ScrapeResult => ({
  provider: "context",
  markdown: "content",
  html: null,
  wordCount: 100,
  title: null,
  description: null,
  canonical: null,
  jsonLd: [],
  links: [],
  ...over,
});

describe("scrapeViaContext", () => {
  const KEYS = ["CONTEXT_DEV_API_KEY", "CONTEXT_API_KEY"] as const;
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns null when no API key is set", async () => {
    for (const k of KEYS) delete process.env[k];
    expect(await scrapeViaContext("https://x.example", jsonFetch({}))).toBeNull();
  });

  it("parses markdown, metadata and jsonLd", async () => {
    process.env.CONTEXT_DEV_API_KEY = "ctxt_secret_test";
    const r = await scrapeViaContext(
      "https://x.example",
      jsonFetch({
        success: true,
        markdown: "# Acme\n\nAcme helps engineering teams ship faster every single day of the week.",
        metadata: { title: "Acme", description: "d", canonicalUrl: "https://x.example/", jsonLd: [{ "@type": "Organization" }] },
      }),
    );
    expect(r?.provider).toBe("context");
    expect(r?.title).toBe("Acme");
    expect(r?.canonical).toBe("https://x.example/");
    expect(r?.jsonLd).toEqual([{ "@type": "Organization" }]);
    expect(r?.wordCount).toBeGreaterThan(5);
  });

  it("returns null on a non-2xx response", async () => {
    process.env.CONTEXT_DEV_API_KEY = "ctxt_secret_test";
    expect(await scrapeViaContext("https://x.example", jsonFetch({}, 429))).toBeNull();
  });
});

describe("scrapeViaFirecrawl", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.FIRECRAWL_API_KEY;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = saved;
  });

  it("returns null when no API key is set", async () => {
    delete process.env.FIRECRAWL_API_KEY;
    expect(await scrapeViaFirecrawl("https://x.example", jsonFetch({}))).toBeNull();
  });

  it("parses the data envelope (markdown + html + links)", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-test";
    const r = await scrapeViaFirecrawl(
      "https://x.example",
      jsonFetch({
        success: true,
        data: {
          markdown: "Acme helps teams ship faster.",
          html: "<html><body><p>Acme helps teams ship faster.</p></body></html>",
          links: ["https://x.example/pricing"],
          metadata: { title: ["Acme"], description: "d", statusCode: 200 },
        },
      }),
    );
    expect(r?.provider).toBe("firecrawl");
    expect(r?.html).toContain("Acme");
    expect(r?.title).toBe("Acme"); // array-valued metadata coerced to first string
    expect(r?.links).toEqual(["https://x.example/pricing"]);
  });
});

describe("scrapeUrl (tiered chain)", () => {
  it("uses the first scraper that succeeds and skips the rest", async () => {
    let firecrawlCalled = false;
    const r = await scrapeUrl("https://x.example", {
      noCache: true,
      scrapers: [
        scraper(result({ provider: "context" })),
        async () => {
          firecrawlCalled = true;
          return result({ provider: "firecrawl" });
        },
      ],
    });
    expect(r?.provider).toBe("context");
    expect(firecrawlCalled).toBe(false);
  });

  it("falls through to the next scraper when the first returns null", async () => {
    const r = await scrapeUrl("https://x.example", {
      noCache: true,
      scrapers: [scraper(null), scraper(result({ provider: "firecrawl" }))],
    });
    expect(r?.provider).toBe("firecrawl");
  });

  it("returns null when every scraper fails", async () => {
    const r = await scrapeUrl("https://x.example", { noCache: true, scrapers: [scraper(null), scraper(null)] });
    expect(r).toBeNull();
  });
});
