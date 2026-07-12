import type { BrandResult } from "./brand";
import type { Finding, PageSnapshot } from "./types";

/**
 * V5.2: per-engine readiness for Google AI Overviews, ChatGPT, Perplexity,
 * Gemini, and Bing Copilot. Sub-score breakdowns ported exactly from
 * `agents/geo-platform-analysis.md` Steps 1-5; synergies + average from Step 6.
 * Scored deterministically from signals other analyzers already produced
 * (brand, citability, crawler, freshness) so the model never re-derives them.
 */

export interface PlatformScore {
  platform: string;
  score: number;
  breakdown: Record<string, number>;
  quickWin: string;
}

export interface PlatformResult {
  platforms: PlatformScore[];
  average: number;
  strongest: string;
  weakest: string;
  synergies: string[];
  findings: Finding[];
}

export interface PlatformSignals {
  snapshot: PageSnapshot;
  brand: BrandResult;
  citabilityScore: number;
  crawlerScore: number;
  freshnessScore: number;
}

const pct = (v: number, max: number) => Math.round((Math.max(0, Math.min(100, v)) / 100) * max);
const detected = (brand: BrandResult, platform: string) =>
  brand.platforms.find((p) => p.platform === platform)?.detected ?? false;

function build(platform: string, breakdown: Record<string, number>): PlatformScore {
  const score = Math.min(100, Math.round(Object.values(breakdown).reduce((s, n) => s + n, 0)));
  const quickWin = Object.entries(breakdown).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "";
  return { platform, score, breakdown, quickWin };
}

export function analyzePlatforms(sig: PlatformSignals): PlatformResult {
  const { snapshot, brand, citabilityScore, crawlerScore, freshnessScore } = sig;
  const html = snapshot.html;
  const qHeadings = snapshot.heading_structure.filter((h) => h.text.trim().endsWith("?")).length;
  const hasTables = /<table[\s>]/i.test(html);
  const ssrOk = snapshot.has_ssr_content;
  const wiki = brand.wikipedia.hasPage;
  const wikidata = brand.wikidata.hasEntry;
  const hasSameAs = brand.platforms.some((p) => p.platform !== "Wikipedia" && p.detected);
  const msvalidate = !!snapshot.meta_tags["msvalidate.01"];
  const indexnow = /indexnow/i.test(html);

  const googleAio = build("Google AI Overviews", {
    content_structure: (qHeadings > 0 ? 15 : 0) + (hasTables ? 10 : 0) + pct(citabilityScore, 15),
    source_authority: pct(brand.score, 30),
    technical: pct(crawlerScore, 15) + (ssrOk ? 15 : 0),
  });

  const chatgpt = build("ChatGPT", {
    entity_recognition: Math.min(35, (wiki ? 20 : 0) + (wikidata ? 10 : 0) + (hasSameAs ? 5 : 0)),
    content: pct(citabilityScore, 40),
    crawler_access: pct(crawlerScore, 25),
  });

  const perplexity = build("Perplexity", {
    community_validation: (detected(brand, "Reddit") ? 15 : 0) + (detected(brand, "Industry & niche") ? 15 : 0),
    source_directness: pct(citabilityScore, 30),
    freshness: pct(freshnessScore, 20),
    technical_access: pct(crawlerScore, 20),
  });

  const gemini = build("Gemini", {
    google_ecosystem: (detected(brand, "YouTube") ? 20 : 0) + pct(brand.score, 15),
    knowledge_graph: (wiki ? 15 : 0) + (wikidata ? 15 : 0),
    content: pct(citabilityScore, 35),
  });

  const bing = build("Bing Copilot", {
    bing_index: (msvalidate ? 15 : 0) + (indexnow ? 15 : 0),
    content: pct(citabilityScore, 30),
    ms_ecosystem: detected(brand, "LinkedIn") ? 20 : 0,
    technical: pct(crawlerScore, 20),
  });

  const platforms = [googleAio, chatgpt, perplexity, gemini, bing];
  const average = Math.round(platforms.reduce((s, p) => s + p.score, 0) / platforms.length);
  const sorted = [...platforms].sort((a, b) => b.score - a.score);

  const synergies: string[] = [];
  if (wiki) synergies.push("A Wikipedia entity lifts ChatGPT, Perplexity, and Gemini at once.");
  if (detected(brand, "YouTube")) synergies.push("YouTube is the top AI-citation signal and boosts Gemini's Google ecosystem score.");
  if (detected(brand, "Reddit")) synergies.push("Reddit discussions raise Perplexity's community-validation score.");
  if (detected(brand, "LinkedIn")) synergies.push("LinkedIn (a Microsoft property) helps Bing Copilot.");

  const findings: Finding[] = [];
  if (average < 50) {
    findings.push({
      pillar: "geo",
      category: "platform_readiness",
      severity: "medium",
      title: `Low AI-engine readiness (avg ${average}/100)`,
      recommendation: `Weakest engine: ${sorted[sorted.length - 1].platform}. Start with its lowest component (${sorted[sorted.length - 1].quickWin.replace(/_/g, " ")}).`,
      fix_capability: "guided",
    });
  }

  return {
    platforms,
    average,
    strongest: sorted[0].platform,
    weakest: sorted[sorted.length - 1].platform,
    synergies,
    findings,
  };
}
