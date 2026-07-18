import { DEFAULT_HEADERS } from "./fetch-page";
import {
  assessEgressUrl,
  createCrawlBudget,
  type CrawlBudget,
  isSameSite,
  readLimitedBody,
  type HostResolver,
} from "./egress";

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
  resolveHostname?: HostResolver;
  maxBytes?: number;
  maxRequests?: number;
  totalTimeoutMs?: number;
  /** Exact hosts explicitly allowed for externally hosted sitemap files. */
  allowedCrossOriginHosts?: string[];
  budget?: CrawlBudget;
  workspaceBudgetKey?: string;
}

const MAX_REDIRECTS = 5;
const MAX_SITEMAP_CHILDREN = 20;
const MAX_XML_ELEMENTS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

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
  const root = new URL(url);
  const { origin } = root;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const deadline = Date.now() + (opts.totalTimeoutMs ?? 30_000);
  const maxRequests = Math.min(50, Math.max(1, opts.maxRequests ?? 25));
  const budget = opts.budget ?? createCrawlBudget(opts.workspaceBudgetKey, {
    maxRequests,
    maxRequestsPerHost: maxRequests,
    maxBytes: (opts.maxBytes ?? DEFAULT_MAX_BYTES) * 4,
    totalTimeoutMs: opts.totalTimeoutMs ?? 30_000,
  });
  const pageCap = Math.min(500, Math.max(1, max));
  let requestCount = 0;
  const allowedExternal = new Set(
    (opts.allowedCrossOriginHosts ?? []).map((host) => host.toLowerCase()),
  );
  // robots.txt Sitemap: directives first, then the common fallback locations.
  const candidates = [
    ...(opts.sitemaps ?? []),
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap/`,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const discovered = new Set<string>();

  const isAllowedSite = (target: URL) =>
    isSameSite(root, target) || allowedExternal.has(target.hostname.toLowerCase());

  const get = async (target: string): Promise<string | null> => {
    try {
      if (requestCount >= maxRequests || Date.now() >= deadline) return null;
      let current = new URL(target, root);
      if (!isAllowedSite(current)) return null;
      let response: Response | null = null;
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        if (requestCount >= maxRequests || Date.now() >= deadline) return null;
        const controller = new AbortController();
        const remaining = Math.max(1, Math.min(timeoutMs, deadline - Date.now()));
        const timer = setTimeout(() => controller.abort(), remaining);
        const decision = await assessEgressUrl(current, {
          resolver: opts.resolveHostname,
          signal: controller.signal,
          requireDnsResolution: !opts.fetchImpl || Boolean(opts.resolveHostname),
        });
        if (!opts.fetchImpl || opts.resolveHostname) {
          console.info("[crawler] sitemap egress", {
            allowed: decision.allowed,
            host: decision.hostname,
            addressCount: decision.addresses.length,
            reason: decision.reason,
          });
        }
        if (!decision.allowed || !decision.normalizedUrl) {
          clearTimeout(timer);
          return null;
        }
        current = new URL(decision.normalizedUrl);
        if (!isAllowedSite(current)) {
          clearTimeout(timer);
          return null;
        }
        budget.takeRequest(current.hostname);
        requestCount += 1;
        try {
          response = await fetchImpl(current.toString(), {
            headers: DEFAULT_HEADERS,
            redirect: "manual",
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
          current = new URL(location, current);
          response = null;
          continue;
        }
        break;
      }
      if (!response) return null;
      if (response.status !== 200) return null;
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (
        contentType &&
        contentType !== "text/plain" &&
        contentType !== "text/xml" &&
        contentType !== "application/xml" &&
        !contentType.endsWith("+xml") &&
        contentType !== "application/octet-stream"
      ) {
        return null;
      }
      // Gzipped sitemaps (.xml.gz) aren't auto-decoded when served as a file.
      if (/\.gz(\?|$)/i.test(current.pathname) && response.body) {
        const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
        const body = await readLimitedBody(new Response(stream), opts.maxBytes ?? DEFAULT_MAX_BYTES);
        budget.addBytes(new TextEncoder().encode(body).byteLength);
        return body;
      }
      const body = await readLimitedBody(response, opts.maxBytes ?? DEFAULT_MAX_BYTES);
      budget.addBytes(new TextEncoder().encode(body).byteLength);
      return body;
    } catch {
      return null;
    }
  };

  for (const candidate of candidates) {
    const xml = await get(candidate);
    if (!xml) continue;

    // Sitemap index: fetch each child sitemap's <url><loc> entries
    const childSitemaps = extractBlocks(xml, "sitemap");
    const elementCount = childSitemaps.length + extractBlocks(xml, "url").length;
    if (elementCount > MAX_XML_ELEMENTS) continue;
    for (const childUrl of childSitemaps.slice(0, MAX_SITEMAP_CHILDREN)) {
      if (discovered.size >= pageCap) break;
      const childXml = await get(childUrl);
      if (!childXml) continue;
      const pages = extractBlocks(childXml, "url");
      if (pages.length > MAX_XML_ELEMENTS) continue;
      for (const page of pages) {
        const pageUrl = new URL(page, root);
        if (isSameSite(root, pageUrl) && ["http:", "https:"].includes(pageUrl.protocol)) {
          discovered.add(pageUrl.toString());
        }
        if (discovered.size >= pageCap) break;
      }
    }

    // Direct <url> entries
    for (const page of extractBlocks(xml, "url")) {
      if (discovered.size >= pageCap) break;
      const pageUrl = new URL(page, root);
      if (isSameSite(root, pageUrl) && ["http:", "https:"].includes(pageUrl.protocol)) {
        discovered.add(pageUrl.toString());
      }
    }

    if (discovered.size > 0) break;
  }

  return [...discovered].slice(0, pageCap);
}
