import { DEFAULT_HEADERS } from "./fetch-page";

/**
 * V0.2 — sitemap crawler. Port of `crawl_sitemap()` from
 * `inspiration-code/scripts/fetch_page.py`: try the common sitemap locations,
 * recurse one level into sitemap indexes, dedupe, cap at `max` pages.
 */

interface SitemapOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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
  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap/`,
  ];

  const discovered = new Set<string>();

  const get = async (target: string): Promise<string | null> => {
    try {
      const response = await fetchImpl(target, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
      });
      return response.status === 200 ? await response.text() : null;
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
