import { DEFAULT_HEADERS } from "./fetch-page";
import { gatherOffsiteSignals, type OffsiteSignals } from "./offsite";
import type { serperSearch } from "@/lib/research/serper";
import type { Finding } from "./types";

/**
 * V5.1 (v3) — brand / entity authority scanner. Wikipedia + Wikidata are checked
 * via their APIs (the single strongest entity signal — never web search, to
 * avoid false negatives). Reddit / YouTube / third-party / LinkedIn presence now
 * comes from *real* off-site lookups (`offsite.ts`) instead of the site's own
 * declared `sameAs` links; declared profiles remain a secondary fallback signal.
 * Weights (geo-ai-visibility.md Step 5): Wikipedia 30 · Reddit 20 · YouTube 15 ·
 * LinkedIn 10 · industry/niche 25 → 0–100. Every earned score is `max(real,
 * declared)`, so with no off-site data the score degrades to Wikipedia/Wikidata
 * plus declared-profile partial credit (never above the old behavior).
 */

export type EvidenceSource = "api" | "serper" | "sameAs" | "none";

export interface BrandPlatform {
  platform: string;
  detected: boolean;
  weight: number;
  earned: number;
  searchUrl: string;
  evidence?: { mentions?: number; recent?: number; source: EvidenceSource };
}

export interface BrandResult {
  brandName: string;
  domain: string | null;
  score: number;
  /** True when no real off-site source responded — score rests on declared profiles. */
  limitedData: boolean;
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

// ── Wikipedia title matching (v3 — exact normalized match, not substring) ────
const CORP_SUFFIX = /\b(inc|llc|ltd|corp|corporation|company|co|group|gmbh|plc|app|io)\b/g;

/** Normalize an entity title for comparison: drop diacritics, parentheticals,
 *  punctuation, and corporate suffixes, then collapse whitespace. */
function normalizeEntity(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD") // decompose accents; the [^a-z0-9] pass below drops the marks
    .replace(/\([^)]*\)/g, "") // strip "(software)", "(company)" disambiguation
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(CORP_SUFFIX, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ScanBrandOptions {
  sameAsUrls?: string[];
  fetchImpl?: typeof fetch;
  serperImpl?: typeof serperSearch;
  /** Pre-gathered off-site signals (injected in tests); self-gathered otherwise. */
  offsite?: OffsiteSignals | null;
  now?: Date;
}

export async function scanBrand(
  brandName: string,
  domain: string | null,
  opts: ScanBrandOptions = {},
): Promise<BrandResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sameAs = opts.sameAsUrls ?? [];

  // Wikipedia, Wikidata, and the off-site gather are independent external
  // lookups — fire them together instead of paying three RTTs in series.
  const [wikiData, wdData, offsiteResult] = await Promise.all([
    // ── Wikipedia (API — top result title must MATCH the brand, not contain it) ─
    getJson(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q(brandName)}&format=json`,
      fetchImpl,
    ),
    // ── Wikidata (API) ─────────────────────────────────────────────────────
    getJson(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q(brandName)}&language=en&format=json`,
      fetchImpl,
    ),
    // ── Real off-site signals (self-gather unless injected) ────────────────
    opts.offsite !== undefined
      ? Promise.resolve(opts.offsite)
      : gatherOffsiteSignals(brandName, domain, {
          fetchImpl,
          serperImpl: opts.serperImpl,
          now: opts.now,
        }),
  ]);
  const offsite = offsiteResult;

  const wiki = { hasPage: false, searchResults: 0 };
  const search = (wikiData as { query?: { search?: { title?: string }[] } })?.query?.search ?? [];
  if (search.length) {
    wiki.searchResults = search.length;
    const top = normalizeEntity(search[0].title ?? "");
    if (top && top === normalizeEntity(brandName)) wiki.hasPage = true;
  }

  const wd = { hasEntry: false, id: null as string | null, description: null as string | null };
  const entities = (wdData as { search?: { id?: string; description?: string }[] })?.search ?? [];
  if (entities.length) {
    wd.hasEntry = true;
    wd.id = entities[0].id ?? null;
    wd.description = entities[0].description ?? null;
  }

  const has = (re: RegExp) => sameAs.some((u) => re.test(u));
  const redditSameAs = has(/reddit\.com/i);
  const youtubeSameAs = has(/youtube\.com|youtu\.be/i);
  const linkedinSameAs = has(/linkedin\.com/i);
  const industryCount = INDUSTRY_PATTERNS.filter(([, re]) => has(re)).length;

  // Reddit (20): real recent-mention tiers, else declared-profile partial (6).
  const realReddit = offsite?.reddit
    ? offsite.reddit.recentMentions >= 10
      ? 20
      : offsite.reddit.recentMentions >= 3
        ? 14
        : offsite.reddit.recentMentions >= 1
          ? 8
          : 0
    : 0;
  const redditEarned = Math.max(realReddit, redditSameAs ? 6 : 0);

  // YouTube (15): official channel > video mentions > declared profile (5).
  const realYoutube = offsite?.youtube
    ? offsite.youtube.officialChannel
      ? 15
      : offsite.youtube.videoMentions >= 3
        ? 10
        : 0
    : 0;
  const youtubeEarned = Math.max(realYoutube, youtubeSameAs ? 5 : 0);

  // LinkedIn (10): a company page found off-site or declared — the URL is verifiable.
  const linkedinFound = Boolean(offsite?.web?.linkedinCompany) || linkedinSameAs;
  const linkedinEarned = linkedinFound ? 10 : 0;

  // Industry & niche (25): declared review/dev profiles (×6, cap 15) + real third-party mentions.
  const industrySameAsPoints = Math.min(15, industryCount * 6);
  const webMentions = offsite?.web?.thirdPartyMentions ?? 0;
  const webMentionPoints = offsite?.web ? (webMentions >= 5 ? 10 : webMentions >= 1 ? 5 : 0) : 0;
  const industryEarned = Math.min(25, industrySameAsPoints + webMentionPoints);
  const industryDetected =
    industryCount > 0 || Boolean(offsite?.web?.knowledgeGraph) || webMentions > 0;

  const platforms: BrandPlatform[] = [
    {
      platform: "Wikipedia",
      detected: wiki.hasPage,
      weight: 30,
      earned: wiki.hasPage ? 30 : wd.hasEntry ? 15 : 0,
      searchUrl: `https://en.wikipedia.org/wiki/Special:Search?search=${q(brandName)}`,
      evidence: { source: wiki.hasPage ? "api" : wd.hasEntry ? "api" : "none" },
    },
    {
      platform: "Reddit",
      detected: (offsite?.reddit?.recentMentions ?? 0) > 0 || redditSameAs,
      weight: 20,
      earned: redditEarned,
      searchUrl: `https://www.reddit.com/search/?q=${q(brandName)}`,
      evidence: offsite?.reddit
        ? { mentions: offsite.reddit.mentions, recent: offsite.reddit.recentMentions, source: offsite.reddit.source }
        : { source: redditSameAs ? "sameAs" : "none" },
    },
    {
      platform: "YouTube",
      detected: Boolean(offsite?.youtube?.officialChannel) || (offsite?.youtube?.videoMentions ?? 0) > 0 || youtubeSameAs,
      weight: 15,
      earned: youtubeEarned,
      searchUrl: `https://www.youtube.com/results?search_query=${q(brandName)}`,
      evidence: offsite?.youtube
        ? { mentions: offsite.youtube.videoMentions, source: "serper" }
        : { source: youtubeSameAs ? "sameAs" : "none" },
    },
    {
      platform: "LinkedIn",
      detected: linkedinFound,
      weight: 10,
      earned: linkedinEarned,
      searchUrl: `https://www.linkedin.com/search/results/companies/?keywords=${q(brandName)}`,
      evidence: { source: offsite?.web?.linkedinCompany ? "serper" : linkedinSameAs ? "sameAs" : "none" },
    },
    {
      platform: "Industry & niche",
      detected: industryDetected,
      weight: 25,
      earned: industryEarned,
      searchUrl: `https://www.g2.com/search?query=${q(brandName)}`,
      evidence: { mentions: webMentions, source: offsite?.web ? "serper" : industryCount > 0 ? "sameAs" : "none" },
    },
  ];

  const score = Math.min(100, platforms.reduce((s, p) => s + p.earned, 0));
  const limitedData = offsite?.limitedData ?? true;

  const recommendations: BrandResult["recommendations"] = [];
  if (sameAs.length === 0) {
    recommendations.push({ horizon: "immediate", action: "Add Organization sameAs schema linking every brand profile — the fastest entity-graph win." });
  }
  const youtubePlatform = platforms[2];
  if (!youtubePlatform.detected) {
    recommendations.push({ horizon: "short-term", action: "Publish educational YouTube content — the strongest AI-citation correlation (0.737 vs 0.266 for backlinks)." });
  }
  if ((offsite?.reddit?.recentMentions ?? 0) < 3) {
    recommendations.push({
      horizon: "short-term",
      action: offsite?.reddit
        ? `Only ${offsite.reddit.recentMentions} Reddit mention(s) in the past year — build authentic presence in your industry subreddits (no marketing speak).`
        : "Build authentic Reddit presence in your industry subreddits (no marketing speak).",
    });
  }
  if (!wiki.hasPage) recommendations.push({ horizon: "long-term", action: "Establish notability through independent press, then create/improve a Wikipedia entry." });
  if (limitedData) {
    recommendations.push({
      horizon: "immediate",
      action: "Off-site presence data was unavailable this run (search API not configured) — this score reflects declared profiles only.",
    });
  }

  const findings: Finding[] = [];
  if (!limitedData && score < 40) {
    findings.push({
      pillar: "geo",
      category: "brand_authority",
      severity: "high",
      title: `Low brand authority (${score}/100)`,
      recommendation:
        "AI models learn entities from off-site signals. Prioritize YouTube + Reddit presence and a complete sameAs graph; pursue Wikipedia notability over time.",
      fix_capability: "guided",
    });
  } else if (!wiki.hasPage && !limitedData) {
    findings.push({
      pillar: "geo",
      category: "brand_authority",
      severity: "medium",
      title: "No Wikipedia entity",
      recommendation: "Wikipedia is the strongest entity signal. Build notability via press coverage, then create/improve the entry.",
      fix_capability: "guided",
    });
  }

  return { brandName, domain, score, limitedData, wikipedia: wiki, wikidata: wd, platforms, recommendations, findings };
}
