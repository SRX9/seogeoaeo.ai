import { DEFAULT_HEADERS } from "./fetch-page";

/**
 * V0.2: sitemap crawler. Port of `crawl_sitemap()` from
 * `inspiration-code/scripts/fetch_page.py`: try the common sitemap locations,
 * recurse one level into sitemap indexes, dedupe, cap at `max` pages.
 */

interface SitemapOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Sitemap URLs declared in robots.txt: tried before the common locations. */
  sitemaps?: string[];
}

function extractBlocks(xml: string, tag: "sitemap" | "url"): string[] {
  const locs: string[] = [];
  const blockRe = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi");
  for (const block of xml.match(blockRe) ?? []) {
    const loc = /<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(block);
    if (loc) locs.push(loc[1].trim().replace(/&amp;/g, "&"));
  }
  return locs;
}

export async function crawlSitemap(
  url: string,
  max = 50,
  opts: SitemapOptions = {},
): Promise<string[]> {
  const { origin } = new URL(url);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  // robots.txt Sitemap: directives first, then the common fallback locations.
  const candidates = [
    ...(opts.sitemaps ?? []),
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap/`,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const discovered = new Set<string>();

  const get = async (target: string): Promise<string | null> => {
    try {
      const response = await fetchImpl(target, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) return null;
      // Gzipped sitemaps (.xml.gz) aren't auto-decoded when served as a file.
      if (/\.gz(\?|$)/i.test(target) && response.body) {
        const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
        return await new Response(stream).text();
      }
      return await response.text();
    } catch {
      return null;
    }
  };

  for (const candidate of candidates) {
    const xml = await get(candidate);
    if (!xml) continue;

    // Sitemap index: fetch each child sitemap's <url><loc> entries
    for (const childUrl of extractBlocks(xml, "sitemap")) {
      if (discovered.size >= max) break;
      const childXml = await get(childUrl);
      if (!childXml) continue;
      for (const page of extractBlocks(childXml, "url")) {
        discovered.add(page);
        if (discovered.size >= max) break;
      }
    }

    // Direct <url> entries
    for (const page of extractBlocks(xml, "url")) {
      if (discovered.size >= max) break;
      discovered.add(page);
    }

    if (discovered.size > 0) break;
  }

  return [...discovered].slice(0, max);
}
