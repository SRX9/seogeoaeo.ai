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

const CONTENT_SUBDOMAINS = new Set([
  "academy",
  "blog",
  "community",
  "docs",
  "help",
  "learn",
  "news",
  "resources",
  "support",
]);

const OWNED_PROPERTY_WORDS = new Set([
  "academy",
  "blog",
  "careers",
  "community",
  "docs",
  "help",
  "learn",
  "news",
  "resources",
  "status",
  "support",
]);

const BRAND_SIGNATURE_STOPWORDS = new Set([
  "app",
  "cloud",
  "co",
  "company",
  "corp",
  "corporation",
  "digital",
  "hq",
  "inc",
  "llc",
  "ltd",
  "online",
  "platform",
  "service",
  "services",
  "software",
  "solution",
  "solutions",
  "technologies",
  "technology",
  "the",
  "tool",
  "tools",
]);

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  "github.io",
  "pages.dev",
  "vercel.app",
  "netlify.app",
  "webflow.io",
  "workers.dev",
  "co.in",
  "co.jp",
  "co.nz",
  "co.uk",
  "com.au",
  "com.br",
  "com.mx",
  "com.sg",
  "com.tr",
  "com.tw",
  "net.au",
  "org.au",
  "org.uk",
]);

const COUNTRY_CODE_SECOND_LEVEL_SUFFIXES = new Set([
  "ac",
  "co",
  "com",
  "edu",
  "gov",
  "net",
  "org",
]);

const HOSTED_PROPERTY_SUFFIXES = new Set([
  "github.io",
  "pages.dev",
  "substack.com",
  "vercel.app",
  "netlify.app",
  "webflow.io",
  "workers.dev",
]);

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
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const raw = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    return isUsablePublicHost(host) ? host : null;
  } catch {
    return null;
  }
}

function isUsablePublicHost(host: string): boolean {
  const parts = host.split(".").filter(Boolean);
  return (
    parts.length >= 2 &&
    parts.every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
  );
}

function isExcludedHost(host: string): boolean {
  return EXCLUDED_HOST_PARTS.some((part) => host === part || host.endsWith(`.${part}`));
}

function registrableHost(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return host;
  }

  const suffix = parts.slice(-2).join(".");
  if (MULTI_PART_PUBLIC_SUFFIXES.has(suffix) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  if (
    parts.length >= 3 &&
    parts.at(-1)?.length === 2 &&
    COUNTRY_CODE_SECOND_LEVEL_SUFFIXES.has(parts.at(-2) ?? "")
  ) {
    return parts.slice(-3).join(".");
  }
  return suffix;
}

function canonicalCompetitorHost(host: string): string {
  const clean = host.replace(/^www\./, "");
  const [subdomain] = clean.split(".");
  if (CONTENT_SUBDOMAINS.has(subdomain)) {
    return registrableHost(clean);
  }
  return clean;
}

function isSameSite(host: string, ownHost: string | null): boolean {
  if (!ownHost) {
    return false;
  }
  return registrableHost(host) === registrableHost(ownHost);
}

function hostLabels(host: string): string[] {
  return host
    .split(".")
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, " "))
    .flatMap((part) => part.split(/\s+/))
    .filter(Boolean);
}

function isHostedBrandPropertyHost(host: string, signatures: Set<string>): boolean {
  for (const suffix of HOSTED_PROPERTY_SUFFIXES) {
    if (host === suffix || !host.endsWith(`.${suffix}`)) {
      continue;
    }
    const subdomain = host.slice(0, -(suffix.length + 1));
    const labels = hostLabels(subdomain);
    const compact = labels.join("");
    for (const signature of signatures) {
      if (labels.length === 1 && labels[0] === signature) {
        return true;
      }
      if (compact === signature) {
        return true;
      }
    }
  }
  return false;
}

function brandSignatures(brandName: string, ownHost: string | null): Set<string> {
  const signatures = new Set<string>();
  const normalized = normalizeEntityName(brandName);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const compactBrand = tokens.join("");

  if (compactBrand.length >= 4) {
    signatures.add(compactBrand);
  }
  for (const token of tokens) {
    if (token.length >= 4 && !BRAND_SIGNATURE_STOPWORDS.has(token)) {
      signatures.add(token);
    }
  }

  if (ownHost) {
    const ownLabels = hostLabels(registrableHost(ownHost)).filter(
      (label) => label.length >= 4 && !BRAND_SIGNATURE_STOPWORDS.has(label),
    );
    for (const label of ownLabels) {
      signatures.add(label);
    }
    const compactHost = ownLabels.join("");
    if (compactHost.length >= 4) {
      signatures.add(compactHost);
    }
  }

  return signatures;
}

function isLikelyOwnBrandHost(
  host: string,
  brandName: string,
  ownHost: string | null,
): boolean {
  if (isSameSite(host, ownHost)) {
    return true;
  }

  const signatures = brandSignatures(brandName, ownHost);
  if (signatures.size === 0) {
    return false;
  }

  const labels = hostLabels(host);
  const hostCompact = labels.join("");
  if (isHostedBrandPropertyHost(host, signatures)) {
    return true;
  }
  for (const signature of signatures) {
    if (hostCompact === signature) {
      return true;
    }
    for (const word of OWNED_PROPERTY_WORDS) {
      if (
        labels.includes(word) &&
        labels.includes(signature)
      ) {
        return true;
      }
      if (
        hostCompact === `${signature}${word}` ||
        hostCompact === `${word}${signature}` ||
        hostCompact.startsWith(`${signature}${word}`) ||
        hostCompact.startsWith(`${word}${signature}`)
      ) {
        return true;
      }
    }
  }

  return false;
}

function normalizeEntityName(value: string | undefined | null): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /\b(inc|llc|ltd|co|company|corp|corporation|software|technologies|technology|app|hq)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isOwnBrandName(candidate: string | undefined | null, brandName: string): boolean {
  const name = normalizeEntityName(candidate);
  const brand = normalizeEntityName(brandName);
  return Boolean(
    name &&
      brand &&
      (name === brand || name.startsWith(`${brand} `) || brand.startsWith(`${name} `)),
  );
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

function normalizeCompetitorUrl(
  value: string | undefined | null,
  ownHost: string | null,
  brandName: string,
): string | null {
  return evaluateCompetitorUrl(value, ownHost, brandName).url;
}

function evaluateCompetitorUrl(
  value: string | undefined | null,
  ownHost: string | null,
  brandName: string,
): { url: string | null; rejection: "invalid" | "excluded" | "own" | null } {
  const rawHost = hostOf(value);
  const host = rawHost ? canonicalCompetitorHost(rawHost) : null;
  if (!host) {
    return { url: null, rejection: "invalid" };
  }
  if (isExcludedHost(host)) {
    return { url: null, rejection: "excluded" };
  }
  if (isLikelyOwnBrandHost(host, brandName, ownHost)) {
    return { url: null, rejection: "own" };
  }
  return { url: `https://${host}`, rejection: null };
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
      const rawHost = hostOf(item.link);
      const host = rawHost ? canonicalCompetitorHost(rawHost) : null;
      if (!host || isLikelyOwnBrandHost(host, brand.name, ownHost)) {
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
async function resolveHomepage(
  name: string,
  ownHost: string | null,
  brandName: string,
): Promise<string | null> {
  const result = await serperSearch(`"${name}" official website`, { num: 4 });
  const kgUrl = normalizeCompetitorUrl(result.knowledgeGraph?.website, ownHost, brandName);
  if (kgUrl) {
    return kgUrl;
  }
  for (const item of result.organic) {
    const url = normalizeCompetitorUrl(item.link, ownHost, brandName);
    if (url) {
      return url;
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
    if (isOwnBrandName(item.name, brand.name)) {
      continue;
    }

    const providedUrl = typeof item.url === "string" ? item.url.trim() : "";
    const evaluatedUrl = evaluateCompetitorUrl(providedUrl, ownHost, brand.name);
    let url = evaluatedUrl.url;
    // The LLM may name a competitor it found only in listicle/answer text —
    // resolve its homepage with a bounded number of extra searches.
    if (
      !url &&
      item.name &&
      resolutions < 3 &&
      (!providedUrl || evaluatedUrl.rejection === "invalid" || evaluatedUrl.rejection === "excluded")
    ) {
      resolutions += 1;
      url = await resolveHomepage(item.name, ownHost, brand.name);
    }
    if (!url) {
      continue;
    }
    const host = hostOf(url)!;
    if (isLikelyOwnBrandHost(host, brand.name, ownHost) || seen.has(host)) {
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
