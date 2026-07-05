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
  /** One-line evidence for why this is a competitor (shown to the user). */
  reason?: string;
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

export type CompetitorDiscoveryInput = {
  name: string;
  website?: string | null;
  productDescription?: string | null;
  seedKeywords?: string | null;
  /**
   * Recent AI answer excerpts (ChatGPT/Perplexity/Gemini) for the brand's
   * tracked prompts. Brands these engines already name in category answers are
   * the strongest competitor signal for an AI-visibility product.
   */
  answerExcerpts?: string[];
};

type Candidate = {
  host: string;
  title: string;
  snippet: string;
  /** How many distinct search queries surfaced this host. */
  sources: number;
  /** Appeared in a "{brand} vs …" result — the highest-precision signal. */
  vs: boolean;
};

/**
 * Gather evidence for competitor discovery from a query fan-out. Excluded hosts
 * (G2, Capterra, Reddit, …) are never candidates themselves, but their result
 * titles/snippets are kept as "listicle" evidence — "Top 10 X alternatives"
 * pages name real competitors in text.
 */
async function gatherEvidence(brand: CompetitorDiscoveryInput, ownHost: string | null) {
  const queries = [
    `"${brand.name}" alternatives`,
    `"${brand.name}" competitors`,
    `"${brand.name}" vs`,
  ];
  const firstKeyword = brand.seedKeywords?.split(/[,\n]/)[0]?.trim();
  if (firstKeyword) {
    queries.push(`best ${firstKeyword}`);
  }
  if (brand.productDescription) {
    queries.push(`best ${brand.productDescription.split(/\s+/).slice(0, 5).join(" ")} tools`);
  }

  const results = await Promise.all(queries.slice(0, 5).map((q) => serperSearch(q, { num: 8 })));

  const candidates = new Map<string, Candidate>();
  const listicles: string[] = [];
  results.forEach((result, queryIndex) => {
    const isVsQuery = queries[queryIndex].includes(" vs");
    const seenThisQuery = new Set<string>();
    for (const item of result.organic) {
      const host = hostOf(item.link);
      if (!host || host === ownHost) {
        continue;
      }
      if (isExcludedHost(host)) {
        if (item.title && listicles.length < 12) {
          listicles.push(`- ${item.title}: ${(item.snippet ?? "").slice(0, 240)}`);
        }
        continue;
      }
      const existing = candidates.get(host);
      if (existing) {
        if (!seenThisQuery.has(host)) {
          existing.sources += 1;
        }
        existing.vs ||= isVsQuery;
      } else {
        candidates.set(host, {
          host,
          title: item.title ?? host,
          snippet: (item.snippet ?? "").slice(0, 160),
          sources: 1,
          vs: isVsQuery,
        });
      }
      seenThisQuery.add(host);
    }
  });

  const ranked = [...candidates.values()].sort(
    (a, b) => b.sources + (b.vs ? 1 : 0) - (a.sources + (a.vs ? 1 : 0)),
  );
  return { candidates: ranked, listicles: [...new Set(listicles)] };
}

/**
 * Resolve a competitor known only by name to its homepage via one search.
 * Returns null when nothing trustworthy comes back.
 */
async function resolveHomepage(name: string, ownHost: string | null): Promise<string | null> {
  const result = await serperSearch(`"${name}" official website`, { num: 4 });
  const kgHost = hostOf(result.knowledgeGraph?.website);
  if (kgHost && kgHost !== ownHost && !isExcludedHost(kgHost)) {
    return `https://${kgHost}`;
  }
  for (const item of result.organic) {
    const host = hostOf(item.link);
    if (host && host !== ownHost && !isExcludedHost(host)) {
      return `https://${host}`;
    }
  }
  return null;
}

/**
 * Discover up to `limit` competitor suggestions for a brand. Evidence-based:
 * a query fan-out (alternatives / competitors / "vs" / category) plus listicle
 * snippets and any AI answer excerpts feed one LLM ranking pass; competitors the
 * LLM names without a URL are resolved via a bounded homepage lookup. Suggestions
 * are deduped by domain, exclude the brand's own site, and are not persisted by
 * the caller until the user picks them.
 */
export async function discoverCompetitors(
  brand: CompetitorDiscoveryInput,
  limit: number,
): Promise<CompetitorSuggestion[]> {
  const cap = Math.max(0, Math.min(limit, 10));
  if (cap === 0) {
    return [];
  }

  const ownHost = hostOf(brand.website);
  const { candidates, listicles } = await gatherEvidence(brand, ownHost);
  const answerExcerpts = (brand.answerExcerpts ?? [])
    .filter(Boolean)
    .slice(0, 6)
    .map((a) => `- ${a.slice(0, 300)}`);

  if (candidates.length === 0 && listicles.length === 0 && answerExcerpts.length === 0) {
    return [];
  }

  // Fallback when the LLM isn't configured: surface the best-corroborated domains.
  if (!getLlmConfig()) {
    return candidates.slice(0, cap).map((c) => ({ name: c.host, url: `https://${c.host}` }));
  }

  const evidenceLabel = (c: Candidate) =>
    `- ${c.title} (${c.host}) — seen in ${c.sources} search${c.sources === 1 ? "" : "es"}${c.vs ? ", comparison page" : ""}`;
  const prompt = competitorDiscoveryPrompt(
    brand,
    {
      candidates: candidates.map(evidenceLabel).join("\n"),
      listicles: listicles.join("\n"),
      answers: answerExcerpts.join("\n"),
    },
    cap,
  );

  let raw: Array<{ name?: string; url?: string; reason?: string }> = [];
  try {
    const { data } = await generateJson<{
      competitors?: Array<{ name?: string; url?: string; reason?: string }>;
    }>("light", [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ]);
    raw = Array.isArray(data?.competitors) ? data.competitors : [];
  } catch {
    raw = candidates.map((c) => ({ name: c.title, url: c.host }));
  }

  const seen = new Set<string>();
  const suggestions: CompetitorSuggestion[] = [];
  let resolutions = 0;
  for (const item of raw) {
    let url = normalizeCompetitorUrl(item.url);
    // The LLM may name a competitor it found only in listicle/answer text —
    // resolve its homepage with a bounded number of extra searches.
    if (!url && item.name && resolutions < 3) {
      resolutions += 1;
      url = await resolveHomepage(item.name, ownHost);
    }
    if (!url) {
      continue;
    }
    const host = hostOf(url)!;
    if (host === ownHost || seen.has(host)) {
      continue;
    }
    seen.add(host);
    suggestions.push({
      name: (item.name || host).trim().slice(0, 200),
      url,
      reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 200) : undefined,
    });
    if (suggestions.length >= cap) {
      break;
    }
  }

  return suggestions;
}
