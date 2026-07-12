import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";

/**
 * V0.1 (v3): resilient content scraping. Plain `fetch` (fetch-page.ts) sees only
 * the raw HTML AI crawlers get and is blocked by bot protection (Cloudflare
 * challenges, DataDome, PerimeterX): which is fatal for competitor/off-site
 * pages and even some owned sites, since Workers egress from datacenter IPs. This
 * escalates to managed scrapers that render JS and rotate proxies: context.dev
 * first (cheaper, returns markdown + metadata + JSON-LD), Firecrawl second
 * (enhanced anti-bot proxies, returns markdown + rendered HTML). Every adapter
 * degrades to null (no key / failure / block) so the caller can fall back, and
 * results are KV-cached so re-audits and the SSR check don't re-pay.
 */

const SCRAPE_TTL_SECONDS = 86_400;

export interface ScrapeResult {
  provider: "context" | "firecrawl";
  markdown: string;
  /** Rendered HTML when the provider returns it (Firecrawl); null for markdown-only (context). */
  html: string | null;
  wordCount: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  jsonLd: unknown[];
  links: string[];
}

export type ScrapeFn = (url: string) => Promise<ScrapeResult | null>;

/** Approximate word count from markdown (strip the lightweight syntax). */
function markdownWordCount(md: string): number {
  const text = md
    .replace(/`{1,3}[^`]*`{1,3}/g, " ") // code
    .replace(/[#>*_~`|\-!]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

const firstString = (v: unknown): string | null =>
  Array.isArray(v) ? (typeof v[0] === "string" ? v[0] : null) : typeof v === "string" ? v : null;

// ── context.dev (GET, markdown + metadata + jsonLd) ──────────────────────────
export async function scrapeViaContext(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScrapeResult | null> {
  const key = process.env.CONTEXT_DEV_API_KEY || process.env.CONTEXT_API_KEY;
  if (!key) return null;
  try {
    const endpoint = new URL("https://api.context.dev/v1/web/scrape/markdown");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("useMainContentOnly", "true");
    const res = await fetchImpl(endpoint.toString(), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      success?: boolean;
      markdown?: string;
      metadata?: {
        title?: string;
        description?: string;
        canonicalUrl?: string;
        jsonLd?: unknown[];
      };
    };
    if (!data.success || typeof data.markdown !== "string") return null;
    const meta = data.metadata ?? {};
    return {
      provider: "context",
      markdown: data.markdown,
      html: null,
      wordCount: markdownWordCount(data.markdown),
      title: meta.title ?? null,
      description: meta.description ?? null,
      canonical: meta.canonicalUrl ?? null,
      jsonLd: Array.isArray(meta.jsonLd) ? meta.jsonLd : [],
      links: [],
    };
  } catch {
    return null;
  }
}

// ── Firecrawl (POST, markdown + rendered html + anti-bot proxies) ────────────
export async function scrapeViaFirecrawl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScrapeResult | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  try {
    const res = await fetchImpl("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html", "links"],
        onlyMainContent: true,
        proxy: "auto", // escalate to enhanced anti-bot proxies as needed
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        markdown?: string;
        html?: string;
        links?: string[];
        metadata?: { title?: unknown; description?: unknown };
      };
    };
    const d = json.data;
    if (!json.success || !d || typeof d.markdown !== "string") return null;
    const meta = d.metadata ?? {};
    return {
      provider: "firecrawl",
      markdown: d.markdown,
      html: typeof d.html === "string" ? d.html : null,
      wordCount: markdownWordCount(d.markdown),
      title: firstString(meta.title),
      description: firstString(meta.description),
      canonical: null,
      jsonLd: [],
      links: Array.isArray(d.links) ? d.links : [],
    };
  } catch {
    return null;
  }
}

/**
 * Scrape a URL through the tiered chain (context → Firecrawl by default),
 * returning the first provider that succeeds, or null when none is configured or
 * all fail. KV-cached 24h keyed by URL.
 */
export async function scrapeUrl(
  url: string,
  opts: { fetchImpl?: typeof fetch; scrapers?: ScrapeFn[]; noCache?: boolean } = {},
): Promise<ScrapeResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const chain: ScrapeFn[] =
    opts.scrapers ?? [(u) => scrapeViaContext(u, fetchImpl), (u) => scrapeViaFirecrawl(u, fetchImpl)];

  const cacheKey = `scrape:${url}`;
  if (!opts.noCache) {
    const cached = await kvGetJson<ScrapeResult>(cacheKey);
    if (cached) return cached;
  }
  for (const scrape of chain) {
    const result = await scrape(url);
    if (result) {
      if (!opts.noCache) await kvPutJson(cacheKey, result, SCRAPE_TTL_SECONDS);
      return result;
    }
  }
  return null;
}
