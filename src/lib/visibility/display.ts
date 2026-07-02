import type { Pillar, SubScore } from "./types";

/**
 * Owner-language display map (01-product-surface.md → "Owner language").
 * The internal SEO/AEO/GEO taxonomy never reaches a user-facing surface —
 * every UI pulls labels from here so strings can't drift.
 */

export const PILLAR_LABELS: Record<Pillar, string> = {
  seo: "Google & search",
  aeo: "Answer boxes",
  geo: "AI assistants",
};

export const SUBSCORE_LABELS: Record<SubScore["key"], string> = {
  citability: "Quotable answers",
  brand: "Brand authority",
  eeat: "Trust signals",
  technical: "Site health",
  schema: "Structured data",
  platform: "AI engine readiness",
};

/** One-line "what's this" explainers for the sub-score tiles (owner language). */
export const SUBSCORE_EXPLAINERS: Record<SubScore["key"], string> = {
  citability: "How easily AI assistants can lift a clean, self-contained answer from your pages.",
  brand: "How well-known your brand is on the places AI learns about companies (Wikipedia, YouTube, Reddit).",
  eeat: "Whether your content shows real experience, expertise, and trustworthiness.",
  technical: "Whether search engines and AI crawlers can actually read and index your site.",
  schema: "The structured data that tells engines exactly what your pages are about.",
  platform: "How ready your site is for each AI engine (ChatGPT, Perplexity, Gemini, and more).",
};

/** The three surface pillars each sub-score rolls up under, for grouping tiles. */
export const SUBSCORE_PILLAR: Record<SubScore["key"], Pillar> = {
  technical: "seo",
  eeat: "seo",
  citability: "aeo",
  schema: "aeo",
  brand: "geo",
  platform: "geo",
};

/** Quick-snapshot signal labels (V1.5 public result). */
export const QUICK_SIGNAL_LABELS = {
  crawlerAccess: "AI assistants can reach your site",
  llmsTxt: "AI site guide (llms.txt)",
  meta: "Search listing basics",
  schema: "Structured data",
  ssr: "Content AI can read",
} as const;

export const SCORE_BANDS = [
  { min: 90, label: "Excellent" },
  { min: 75, label: "Good" },
  { min: 60, label: "Fair" },
  { min: 40, label: "Poor" },
  { min: 0, label: "Critical" },
] as const;

export function scoreBand(score: number): string {
  return SCORE_BANDS.find((b) => score >= b.min)?.label ?? "Critical";
}
