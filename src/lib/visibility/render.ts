import { scrapeUrl, type ScrapeFn } from "./scrape";
import type { PageSnapshot } from "./types";

/**
 * V2.2 (v3) — true SSR check. `fetch-page.ts` only sees the raw HTML AI crawlers
 * receive; this compares that to a real JS-rendered scrape (context.dev /
 * Firecrawl via `scrape.ts`) of the same URL. A large word gap means the main
 * content is JavaScript-injected and therefore invisible to GPTBot/ClaudeBot/
 * PerplexityBot. Uses the same managed scraper as the content-fetch fallback
 * (not Cloudflare Browser Rendering, which has no anti-bot and is frequently
 * blocked). Degrades gracefully: with no scraper configured or on any failure it
 * reports `available: false` and the caller falls back to the static heuristic.
 */

export interface RenderComparison {
  available: boolean;
  raw_word_count: number;
  rendered_word_count: number | null;
  /** raw / rendered — <1 means the raw HTML is missing content the scraper rendered. */
  ratio: number | null;
  /** Rendered has real content (≥200 words) the raw HTML largely lacks (ratio <0.7). */
  missing_content: boolean;
  /** Most of the content is client-rendered (ratio <0.3). */
  severe: boolean;
  note: string;
}

export function unavailableComparison(rawWords: number): RenderComparison {
  return {
    available: false,
    raw_word_count: rawWords,
    rendered_word_count: null,
    ratio: null,
    missing_content: false,
    severe: false,
    note: "Rendered comparison unavailable — SSR assessed from static HTML heuristics.",
  };
}

/** Pure raw-vs-rendered verdict from two word counts (reused when a scrape is already in hand). */
export function buildComparison(rawWords: number, renderedWords: number): RenderComparison {
  const ratio = renderedWords > 0 ? rawWords / renderedWords : null;
  // Only judge when the render actually produced substantial content.
  const enough = renderedWords >= 200 && ratio !== null;
  const missing = enough && ratio < 0.7;
  const severe = enough && ratio < 0.3;
  return {
    available: true,
    raw_word_count: rawWords,
    rendered_word_count: renderedWords,
    ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
    missing_content: missing,
    severe,
    note: missing
      ? `Rendered page has ${renderedWords} words but only ${rawWords} are in the raw HTML AI crawlers receive.`
      : "Raw HTML contains the rendered content — good for AI crawlers.",
  };
}

export async function compareRenderedContent(
  snapshot: PageSnapshot,
  opts: { scrape?: ScrapeFn } = {},
): Promise<RenderComparison> {
  let scraped;
  try {
    scraped = opts.scrape ? await opts.scrape(snapshot.url) : await scrapeUrl(snapshot.url);
  } catch {
    return unavailableComparison(snapshot.word_count); // a scrape failure must never fail the audit
  }
  if (!scraped) return unavailableComparison(snapshot.word_count);
  return buildComparison(snapshot.word_count, scraped.wordCount);
}
