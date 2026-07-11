import type { Pillar, SubScore } from "./types";

/**
 * Owner-language display map (01-product-surface.md → "Owner language").
 * The internal SEO/AEO/GEO taxonomy never reaches a user-facing surface.
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

/**
 * AP4: THE autonomy category registry: every fix category the standing loop
 * can act on, its owner-language label, and whether its analyzer emits
 * `fix_capability: auto` findings (drives the settings UI's *default* level;
 * per-finding dispatch always trusts the finding's own `fixCapability`).
 * Single source of truth: the settings UI, the PATCH enum, and
 * AUTO_CAPABLE_CATEGORIES all derive from this map, so a new analyzer category
 * only ever gets added here. Purely informational finding categories stay out
 * of the autonomy surface.
 */
export const AUTONOMY_CATEGORIES: Record<string, { label: string; autoCapable: boolean }> = {
  meta_tags: { label: "Search listings (titles & descriptions)", autoCapable: true },
  schema: { label: "Structured data", autoCapable: true },
  llms_txt: { label: "AI site guide (llms.txt)", autoCapable: true },
  crawler_access: { label: "Crawler access", autoCapable: true },
  answer_share: { label: "AI answer coverage", autoCapable: true },
  performance: { label: "Speed fixes", autoCapable: true },
  search_ctr: { label: "Low-click rescue (title rewrites)", autoCapable: true },
};

/** Owner-language labels for the per-category autonomy controls (derived). */
export const AUTONOMY_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(AUTONOMY_CATEGORIES).map(([category, { label }]) => [category, label]),
);

/** "Week of June 29, 2026" from an ISO Monday (YYYY-MM-DD). Rendered in UTC so
 * the label never slips a day for viewers west of Greenwich. */
export function weekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  return `Week of ${date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

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

/** Site Health checklist group labels (owner language, client-safe). */
export const HEALTH_GROUP_LABELS = {
  search_listing: "Search listing",
  social_preview: "Social & link previews",
  performance: "Speed (Core Web Vitals)",
  crawler_access: "Crawler access",
  structured_data: "Structured data",
  ai_readiness: "AI readiness",
  security: "Security",
} as const;

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
