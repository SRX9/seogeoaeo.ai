import { markdownToHtml } from "@/lib/publishing/markdown-html";
import { fetchPage } from "./fetch-page";
import { buildComparison, compareRenderedContent, type RenderComparison, unavailableComparison } from "./render";
import { scrapeUrl, type ScrapeFn, type ScrapeResult } from "./scrape";
import type { PageSnapshot } from "./types";

/**
 * V0.1 (v3) — resilient page fetch. Plain `fetch` is Tier 1; when it comes back
 * blocked (bot-protection challenge / 403 / 429 / total failure) or thin
 * (client-rendered, near-empty), we escalate to the managed scrapers
 * (`scrape.ts`: context.dev → Firecrawl) and rebuild the snapshot from the
 * rendered content so the analyzers score the *real* page. Two correctness wins:
 * we stop scoring bot-challenge interstitials as if they were the site, and we
 * keep the SSR diagnostic honest (raw-vs-rendered only when the raw fetch was a
 * valid 200, never on a block). Everything degrades: no scraper → the raw
 * snapshot is returned as-is.
 */

export type Adequacy = "ok" | "blocked" | "thin";

// Interstitials from the common bot managers — a 200 body that is NOT the site.
const CHALLENGE_MARKERS: RegExp[] = [
  /just a moment/i,
  /checking your browser before accessing/i,
  /cf-browser-verification/i,
  /enable javascript and cookies to continue/i,
  /attention required!\s*\|\s*cloudflare/i,
  /request unsuccessful\.\s*incapsula/i,
  /_incapsula_/i,
  /\bdatadome\b/i,
  /px-captcha/i,
  /captcha-delivery\.com/i,
  /\bare you a (?:human|robot)\b/i,
];

/** Detect a bot-protection interstitial served with a 200 (or a block header). */
export function isChallengePage(snapshot: PageSnapshot): boolean {
  if (snapshot.headers["cf-mitigated"]) return true;
  if (snapshot.word_count >= 500) return false; // real pages aren't tiny
  const html = snapshot.html ?? "";
  return CHALLENGE_MARKERS.some((re) => re.test(html));
}

const THIN_WORDS = 120;

export function assessAdequacy(snapshot: PageSnapshot): Adequacy {
  const status = snapshot.status_code;
  if (status === null || status === 0) return "blocked"; // total fetch failure — a scraper may still get it
  if (status === 401 || status === 403 || status === 429 || status === 503) return "blocked";
  if (isChallengePage(snapshot)) return "blocked";
  if (status >= 200 && status < 300) {
    if (snapshot.has_ssr_content === false) return "thin"; // client-rendered
    if (snapshot.word_count < THIN_WORDS) return "thin";
    return "ok";
  }
  return "ok"; // 404 / other 4xx-5xx: scraping won't reliably help — leave as-is
}

/**
 * Rebuild a snapshot from a scrape by re-parsing the rendered HTML through the
 * exact `fetchPage` parser (fed the scraped HTML), then re-attaching the real
 * transport response (status/headers/redirects) from the original raw fetch.
 * The SSR diagnostic (`has_ssr_content`) is decided by the caller, not here.
 */
async function mergeScrape(raw: PageSnapshot, scrape: ScrapeResult, url: string): Promise<PageSnapshot> {
  // Firecrawl returns a full document; context returns markdown → an HTML
  // fragment, which linkedom won't parse as a document unless wrapped.
  const body = scrape.html ?? markdownToHtml(scrape.markdown);
  const recoveredHtml = /<html[\s>]/i.test(body)
    ? body
    : `<!doctype html><html><head><title>${scrape.title ?? ""}</title></head><body>${body}</body></html>`;
  const parsed = await fetchPage(url, {
    fetchImpl: async () =>
      new Response(recoveredHtml, { status: 200, headers: { "content-type": "text/html" } }),
  });
  return {
    ...parsed, // title, meta, headings, structured_data, text_content, links, images from rendered HTML
    status_code: raw.status_code,
    headers: raw.headers,
    security_headers: raw.security_headers,
    redirect_chain: raw.redirect_chain,
    has_ssr_content: raw.has_ssr_content, // caller sets the real SSR verdict
    title: parsed.title ?? scrape.title,
    description: parsed.description ?? scrape.description,
    canonical: parsed.canonical ?? scrape.canonical,
    structured_data: parsed.structured_data.length ? parsed.structured_data : scrape.jsonLd,
    errors: [...raw.errors, `content recovered via ${scrape.provider} scraper`],
  };
}

export interface ResilientResult {
  snapshot: PageSnapshot;
  render: RenderComparison;
  /** Content came from a scraper because the raw fetch was blocked/thin. */
  recovered: boolean;
  /** The raw fetch looked bot-blocked (challenge / 403 / total failure). */
  blocked: boolean;
}

export interface ResilientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Injectable scraper (defaults to the tiered context→Firecrawl chain). */
  scrapeImpl?: ScrapeFn;
  /** Skip the SSR render comparison (e.g. for non-homepage pages). */
  skipRender?: boolean;
}

/**
 * Fetch a page with Tier-1 `fetch`, escalating to the scraper chain on a
 * blocked/thin result. Also returns the SSR comparison for the caller (only
 * meaningful/available on a valid 200 — never diagnosed off a challenge page).
 */
export async function fetchPageResilient(
  url: string,
  opts: ResilientOptions = {},
): Promise<ResilientResult> {
  const raw = await fetchPage(url, { fetchImpl: opts.fetchImpl, timeoutMs: opts.timeoutMs });
  const adequacy = assessAdequacy(raw);
  const scrape: ScrapeFn = opts.scrapeImpl ?? ((u) => scrapeUrl(u, { fetchImpl: opts.fetchImpl }));

  // Healthy page: score the raw HTML; SSR check compares it to a fresh render.
  if (adequacy === "ok") {
    const render = opts.skipRender
      ? unavailableComparison(raw.word_count)
      : await compareRenderedContent(raw, { scrape });
    if (render.available) raw.has_ssr_content = !render.missing_content;
    return { snapshot: raw, render, recovered: false, blocked: false };
  }

  const scraped = await scrape(url);
  const blocked = adequacy === "blocked";

  // SSR verdict is only valid for a real 200-but-thin page (client-rendered),
  // never for a bot-blocked page where the raw body is an interstitial.
  let render = unavailableComparison(raw.word_count);
  if (!blocked && scraped && !opts.skipRender) {
    render = buildComparison(raw.word_count, scraped.wordCount);
    if (render.available) raw.has_ssr_content = !render.missing_content;
  }

  if (!scraped) {
    if (blocked) {
      raw.errors.push("Live page appears blocked by bot protection; no scraper configured to recover it.");
    }
    return { snapshot: raw, render, recovered: false, blocked };
  }

  return { snapshot: await mergeScrape(raw, scraped, url), render, recovered: true, blocked };
}
