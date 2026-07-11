import { parseHTML } from "linkedom";
import type { PageSnapshot, RedirectHop } from "./types";

/**
 * V0.1: page fetcher. 1:1 port of `fetch_page()` from
 * `inspiration-code/scripts/fetch_page.py`. Fetches RAW HTML (JSON-LD and meta
 * must survive), records the redirect chain, and applies the exact SSR
 * heuristic (<50 chars in a framework root AND <200 words on the page).
 */

/** Desktop UA + headers, verbatim from fetch_page.py DEFAULT_HEADERS. */
export const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const SECURITY_HEADERS = [
  "Strict-Transport-Security",
  "Content-Security-Policy",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
];

const MAX_REDIRECTS = 10;

export interface FetchPageOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Follow redirects manually so the chain is recorded. */
async function fetchWithRedirects(
  url: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ response: Response; chain: RedirectHop[] }> {
  const chain: RedirectHop[] = [];
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetchImpl(current, {
      headers: DEFAULT_HEADERS,
      redirect: "manual",
      signal,
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      chain.push({ url: current, status: response.status });
      current = new URL(location, current).toString();
      continue;
    }
    return { response, chain };
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

export async function fetchPage(
  url: string,
  opts: FetchPageOptions = {},
): Promise<PageSnapshot> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const fetchImpl = opts.fetchImpl ?? fetch;

  const result: PageSnapshot = {
    url,
    status_code: null,
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
    html: "",
  };

  let scheme: string;
  try {
    scheme = new URL(url).protocol.replace(":", "");
  } catch {
    result.errors.push(`Invalid URL: ${url}`);
    return result;
  }
  if (scheme !== "http" && scheme !== "https") {
    result.errors.push(
      `Unsupported URL scheme: '${scheme}'. Only http and https are allowed.`,
    );
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { response, chain } = await fetchWithRedirects(
      url,
      fetchImpl,
      controller.signal,
    );
    result.redirect_chain = chain;
    result.status_code = response.status;
    response.headers.forEach((value, key) => {
      result.headers[key] = value;
    });
    for (const header of SECURITY_HEADERS) {
      result.security_headers[header] = response.headers.get(header);
    }

    const html = await response.text();
    result.html = html;
    const { document } = parseHTML(html);

    // Title
    result.title = normalizeText(document.querySelector("title")?.textContent) || null;

    // Meta tags
    for (const meta of document.querySelectorAll("meta")) {
      const name = meta.getAttribute("name") ?? meta.getAttribute("property") ?? "";
      const content = meta.getAttribute("content") ?? "";
      if (name && content) {
        result.meta_tags[name.toLowerCase()] = content;
        if (name.toLowerCase() === "description") {
          result.description = content;
        }
      }
    }

    // Canonical
    result.canonical =
      document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;

    // Headings
    for (let level = 1; level <= 6; level++) {
      for (const heading of document.querySelectorAll(`h${level}`)) {
        const text = normalizeText(heading.textContent);
        result.heading_structure.push({ level, text });
        if (level === 1) result.h1_tags.push(text);
      }
    }

    // Structured data (JSON-LD): extract before any DOM mutation
    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]',
    )) {
      try {
        result.structured_data.push(JSON.parse(script.textContent ?? ""));
      } catch {
        result.errors.push("Invalid JSON-LD detected");
      }
    }

    // SSR check: measure framework roots BEFORE stripping elements
    const rootIdPattern = /(app|root|__next|__nuxt)/i;
    const ssrChecks: { id: string; textLength: number }[] = [];
    for (const el of document.querySelectorAll("[id]")) {
      const id = el.getAttribute("id") ?? "";
      if (rootIdPattern.test(id)) {
        ssrChecks.push({ id, textLength: normalizeText(el.textContent).length });
      }
    }

    // Text content: strip non-content elements (destructive from here on)
    for (const el of document.querySelectorAll("script,style,nav,footer,header")) {
      el.remove();
    }
    const text = normalizeText(document.documentElement?.textContent);
    result.text_content = text;
    result.word_count = text ? text.split(/\s+/).length : 0;

    // Links (post-strip, matching the Python order: nav/footer links excluded)
    const baseHost = new URL(url).host;
    for (const link of document.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href") ?? "";
      let resolved: URL;
      try {
        resolved = new URL(href, url);
      } catch {
        continue;
      }
      const entry = { url: resolved.toString(), text: normalizeText(link.textContent) };
      if (resolved.host === baseHost) {
        result.internal_links.push(entry);
      } else if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        result.external_links.push(entry);
      }
    }

    // Images
    for (const img of document.querySelectorAll("img")) {
      result.images.push({
        src: img.getAttribute("src") ?? "",
        alt: img.getAttribute("alt") ?? "",
        width: img.getAttribute("width"),
        height: img.getAttribute("height"),
        loading: img.getAttribute("loading"),
      });
    }

    // SSR assessment: a framework root with minimal content only counts as
    // client-side rendering when the whole page is also thin, so SSR/prerendered
    // sites (WordPress, Prerender.io) with framework-style ids don't false-positive.
    for (const check of ssrChecks) {
      if (check.textLength < 50 && result.word_count < 200) {
        result.has_ssr_content = false;
        result.errors.push(
          `Possible client-side only rendering detected: #${check.id} has minimal ` +
            `server-rendered content (${result.word_count} words on page)`,
        );
      }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      result.errors.push(`Timeout after ${timeoutMs / 1000} seconds`);
    } else {
      result.errors.push(
        `Fetch error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  return result;
}
