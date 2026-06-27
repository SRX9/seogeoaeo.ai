/**
 * AI brand enrichment: turn a brand name + website into a content-marketing
 * profile, and discover competitors. Both are grounded in Serper search results
 * (no server-side fetch of user URLs → no SSRF) and refined by one light-tier
 * LLM call. Everything degrades gracefully when Serper or the LLM is unconfigured.
 */
import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { brandPrefillPrompt, competitorDiscoveryPrompt } from "@/lib/llm/prompts";
import { serperSearch, type SerperResult } from "@/lib/research/serper";

export type BrandDetails = {
  productDescription: string;
  audience: string;
  tone: string;
  seedKeywords: string;
};

export type CompetitorSuggestion = {
  name: string;
  url: string;
};

// Field maxima mirror brandProfileSchema so suggestions always pass validation.
const FIELD_LIMITS = {
  productDescription: 4000,
  audience: 500,
  tone: 200,
  seedKeywords: 1000,
} as const;

// Sites that are never genuine competitors — filtered in both the LLM and the
// keyless fallback path.
const EXCLUDED_HOST_PARTS = [
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "getapp.com",
  "softwareadvice.com",
  "producthunt.com",
  "wikipedia.org",
  "youtube.com",
  "reddit.com",
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "medium.com",
  "quora.com",
  "amazon.com",
];

const EMPTY_DETAILS: BrandDetails = {
  productDescription: "",
  audience: "",
  tone: "",
  seedKeywords: "",
};

function clampField(value: unknown, key: keyof typeof FIELD_LIMITS): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, FIELD_LIMITS[key]);
}

/** Hostname without a leading "www.", or null when the value isn't a URL/host. */
function hostOf(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const raw = value.includes("://") ? value : `https://${value}`;
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isExcludedHost(host: string): boolean {
  return EXCLUDED_HOST_PARTS.some((part) => host === part || host.endsWith(`.${part}`));
}

/** Compact, bounded text block from a Serper result for the LLM context window. */
function serperContext(results: SerperResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    const kg = result.knowledgeGraph;
    if (kg && (kg.title || kg.description)) {
      lines.push(
        `Knowledge graph: ${[kg.title, kg.type, kg.description].filter(Boolean).join(" — ")}`,
      );
    }
    for (const item of result.organic.slice(0, 5)) {
      if (!item.title) {
        continue;
      }
      lines.push(`- ${item.title}: ${(item.snippet ?? "").slice(0, 240)}`);
    }
  }

  // Dedupe lines and hard-cap the total context size to keep tokens (and cost) low.
  return [...new Set(lines)].join("\n").slice(0, 4000);
}

/**
 * Infer a brand's content profile from web search. Returns empty strings (not an
 * error) when Serper or the LLM is unavailable, so the form just stays manual.
 */
export async function extractBrandDetails(brand: {
  name: string;
  website?: string | null;
}): Promise<BrandDetails> {
  const queries = [brand.name.trim()];
  const host = hostOf(brand.website);
  if (host) {
    queries.push(`site:${host}`);
  }

  const results = await Promise.all(queries.map((q) => serperSearch(q, { num: 6 })));
  const context = serperContext(results);

  if (!getLlmConfig() || !context) {
    return EMPTY_DETAILS;
  }

  const prompt = brandPrefillPrompt(brand, context);
  try {
    const { data } = await generateJson<Partial<BrandDetails>>("light", [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    return {
      productDescription: clampField(data?.productDescription, "productDescription"),
      audience: clampField(data?.audience, "audience"),
      tone: clampField(data?.tone, "tone"),
      seedKeywords: clampField(data?.seedKeywords, "seedKeywords"),
    };
  } catch {
    return EMPTY_DETAILS;
  }
}

function normalizeCompetitorUrl(value: string | undefined | null): string | null {
  const host = hostOf(value);
  if (!host || isExcludedHost(host)) {
    return null;
  }
  return `https://${host}`;
}

/**
 * Discover up to `limit` competitor suggestions for a brand. Suggestions are
 * deduped by domain and exclude the brand's own site. Not persisted by the caller
 * until the user picks them.
 */
export async function discoverCompetitors(
  brand: { name: string; website?: string | null; productDescription?: string | null },
  limit: number,
): Promise<CompetitorSuggestion[]> {
  const cap = Math.max(0, Math.min(limit, 10));
  if (cap === 0) {
    return [];
  }

  const ownHost = hostOf(brand.website);
  const queries = [`${brand.name} alternatives`, `${brand.name} competitors`];
  if (brand.productDescription) {
    queries.push(`best ${brand.productDescription.split(/\s+/).slice(0, 5).join(" ")} tools`);
  }

  const results = await Promise.all(queries.map((q) => serperSearch(q, { num: 8 })));

  // Collect candidate hosts (deduped, excluding the brand + junk sites), keeping
  // a representative title for each so the LLM has labels to work with.
  const candidates = new Map<string, { host: string; title: string }>();
  for (const result of results) {
    for (const item of result.organic) {
      const host = hostOf(item.link);
      if (!host || host === ownHost || isExcludedHost(host) || candidates.has(host)) {
        continue;
      }
      candidates.set(host, { host, title: item.title ?? host });
    }
  }

  if (candidates.size === 0) {
    return [];
  }

  const candidateList = [...candidates.values()];

  // Fallback when the LLM isn't configured: surface the top deduped domains.
  if (!getLlmConfig()) {
    return candidateList
      .slice(0, cap)
      .map((c) => ({ name: c.host, url: `https://${c.host}` }));
  }

  const prompt = competitorDiscoveryPrompt(
    brand,
    candidateList.map((c) => `- ${c.title} (${c.host})`).join("\n"),
    cap,
  );

  let raw: Array<{ name?: string; url?: string }> = [];
  try {
    const { data } = await generateJson<{ competitors?: Array<{ name?: string; url?: string }> }>(
      "light",
      [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    );
    raw = Array.isArray(data?.competitors) ? data.competitors : [];
  } catch {
    raw = candidateList.map((c) => ({ name: c.title, url: c.host }));
  }

  const seen = new Set<string>();
  const suggestions: CompetitorSuggestion[] = [];
  for (const item of raw) {
    const url = normalizeCompetitorUrl(item.url);
    if (!url) {
      continue;
    }
    const host = hostOf(url)!;
    if (host === ownHost || seen.has(host)) {
      continue;
    }
    seen.add(host);
    suggestions.push({ name: (item.name || host).trim().slice(0, 200), url });
    if (suggestions.length >= cap) {
      break;
    }
  }

  return suggestions;
}
