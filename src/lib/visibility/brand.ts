import { DEFAULT_HEADERS } from "./fetch-page";
import type { Finding } from "./types";

/**
 * V5.1 — brand / entity authority scanner. Wikipedia + Wikidata are checked via
 * their APIs (verbatim port of `brand_scanner.py` `check_wikipedia_presence`),
 * the single strongest entity signal — never web search (false negatives). Other
 * platforms are detected from the brand's own declared `sameAs` profiles.
 * Weights (geo-ai-visibility.md Step 5 / ticket Step 4): Wikipedia 30 · Reddit 20
 * · YouTube 15 · LinkedIn 10 · industry/niche 25 → 0–100.
 */

export interface BrandPlatform {
  platform: string;
  detected: boolean;
  weight: number;
  earned: number;
  searchUrl: string;
}

export interface BrandResult {
  brandName: string;
  domain: string | null;
  score: number;
  wikipedia: { hasPage: boolean; searchResults: number };
  wikidata: { hasEntry: boolean; id: string | null; description: string | null };
  platforms: BrandPlatform[];
  recommendations: { horizon: "immediate" | "short-term" | "long-term"; action: string }[];
  findings: Finding[];
}

const INDUSTRY_PATTERNS: [name: string, re: RegExp][] = [
  ["G2", /g2\.com/i],
  ["Capterra", /capterra\.com/i],
  ["Trustpilot", /trustpilot\.com/i],
  ["Crunchbase", /crunchbase\.com/i],
  ["GitHub", /github\.com/i],
  ["Product Hunt", /producthunt\.com/i],
  ["Quora", /quora\.com/i],
  ["Stack Overflow", /stackoverflow\.com/i],
];

const q = (s: string) => encodeURIComponent(s);

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, { headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(15_000) });
    return res.status === 200 ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Deep-collect all `sameAs` URLs from parsed JSON-LD structured data. */
export function collectSameAs(structuredData: unknown[]): string[] {
  const urls: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const s = (node as Record<string, unknown>)["sameAs"];
      if (typeof s === "string") urls.push(s);
      if (Array.isArray(s)) for (const v of s) if (typeof v === "string") urls.push(v);
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(structuredData);
  return [...new Set(urls)];
}

export async function scanBrand(
  brandName: string,
  domain: string | null,
  opts: { sameAsUrls?: string[]; fetchImpl?: typeof fetch } = {},
): Promise<BrandResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sameAs = opts.sameAsUrls ?? [];

  // ── Wikipedia (API — top result title must contain the brand) ────────────
  const wiki = { hasPage: false, searchResults: 0 };
  const wikiData = await getJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q(brandName)}&format=json`,
    fetchImpl,
  );
  const search = (wikiData as { query?: { search?: { title?: string }[] } })?.query?.search ?? [];
  if (search.length) {
    wiki.searchResults = search.length;
    if ((search[0].title ?? "").toLowerCase().includes(brandName.toLowerCase())) wiki.hasPage = true;
  }

  // ── Wikidata (API) ───────────────────────────────────────────────────────
  const wd = { hasEntry: false, id: null as string | null, description: null as string | null };
  const wdData = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q(brandName)}&language=en&format=json`,
    fetchImpl,
  );
  const entities = (wdData as { search?: { id?: string; description?: string }[] })?.search ?? [];
  if (entities.length) {
    wd.hasEntry = true;
    wd.id = entities[0].id ?? null;
    wd.description = entities[0].description ?? null;
  }

  // ── Platform detection from declared sameAs profiles ─────────────────────
  const has = (re: RegExp) => sameAs.some((u) => re.test(u));
  const industryCount = INDUSTRY_PATTERNS.filter(([, re]) => has(re)).length;

  const platforms: BrandPlatform[] = [
    {
      platform: "Wikipedia",
      detected: wiki.hasPage,
      weight: 30,
      earned: wiki.hasPage ? 30 : wd.hasEntry ? 15 : 0,
      searchUrl: `https://en.wikipedia.org/wiki/Special:Search?search=${q(brandName)}`,
    },
    {
      platform: "Reddit",
      detected: has(/reddit\.com/i),
      weight: 20,
      earned: has(/reddit\.com/i) ? 20 : 0,
      searchUrl: `https://www.reddit.com/search/?q=${q(brandName)}`,
    },
    {
      platform: "YouTube",
      detected: has(/youtube\.com|youtu\.be/i),
      weight: 15,
      earned: has(/youtube\.com|youtu\.be/i) ? 15 : 0,
      searchUrl: `https://www.youtube.com/results?search_query=${q(brandName)}`,
    },
    {
      platform: "LinkedIn",
      detected: has(/linkedin\.com/i),
      weight: 10,
      earned: has(/linkedin\.com/i) ? 10 : 0,
      searchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${q(brandName)}`,
    },
    {
      platform: "Industry & niche",
      detected: industryCount > 0,
      weight: 25,
      earned: Math.min(25, industryCount * 8),
      searchUrl: `https://www.g2.com/search?query=${q(brandName)}`,
    },
  ];

  const score = Math.min(100, platforms.reduce((s, p) => s + p.earned, 0));

  const recommendations: BrandResult["recommendations"] = [];
  if (sameAs.length === 0) {
    recommendations.push({ horizon: "immediate", action: "Add Organization sameAs schema linking every brand profile — the fastest entity-graph win." });
  }
  if (!platforms[2].detected) recommendations.push({ horizon: "short-term", action: "Publish educational YouTube content — the strongest AI-citation correlation (0.737 vs 0.266 for backlinks)." });
  if (!platforms[1].detected) recommendations.push({ horizon: "short-term", action: "Build authentic Reddit presence in your industry subreddits (no marketing speak)." });
  if (!wiki.hasPage) recommendations.push({ horizon: "long-term", action: "Establish notability through independent press, then create/improve a Wikipedia entry." });

  const findings: Finding[] = [];
  if (score < 40) {
    findings.push({
      pillar: "geo",
      category: "brand_authority",
      severity: "high",
      title: `Low brand authority (${score}/100)`,
      recommendation:
        "AI models learn entities from off-site signals. Prioritize YouTube + Reddit presence and a complete sameAs graph; pursue Wikipedia notability over time.",
      fix_capability: "guided",
    });
  } else if (!wiki.hasPage) {
    findings.push({
      pillar: "geo",
      category: "brand_authority",
      severity: "medium",
      title: "No Wikipedia entity",
      recommendation: "Wikipedia is the strongest entity signal. Build notability via press coverage, then create/improve the entry.",
      fix_capability: "guided",
    });
  }

  return { brandName, domain, score, wikipedia: wiki, wikidata: wd, platforms, recommendations, findings };
}
