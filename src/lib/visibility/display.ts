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
