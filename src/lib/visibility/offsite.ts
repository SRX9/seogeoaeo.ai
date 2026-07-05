import { serperSearch } from "@/lib/research/serper";
import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";

/**
 * V5.1 (v3) — real off-site brand presence. The original brand scanner inferred
 * Reddit/YouTube/LinkedIn presence from the site's *own* declared `sameAs`
 * links, which measured schema hygiene, not authority. This gathers actual
 * signals: Reddit's free public JSON search (mention volume + recency), and
 * YouTube / third-party / LinkedIn / knowledge-graph presence via the existing
 * Serper client. Every lookup degrades gracefully (null on failure, no key, or
 * a blocked request) so an audit never fails on a third-party outage. Results
 * are KV-cached 24h since setup-run + daily audits re-scan the same brand.
 */

const OFFSITE_TTL_SECONDS = 86_400;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Reddit requires a descriptive, non-browser User-Agent or it 429/403s.
const REDDIT_UA = "web:seogeoaeo.ai:1.0 (by /u/seogeoaeo visibility auditor)";

export interface RedditPresence {
  mentions: number;
  recentMentions: number;
  subreddits: number;
  source: "api" | "serper";
}
export interface YoutubePresence {
  officialChannel: boolean;
  videoMentions: number;
}
export interface WebPresence {
  thirdPartyMentions: number;
  knowledgeGraph: boolean;
  linkedinCompany: boolean;
}
export interface OffsiteSignals {
  reddit: RedditPresence | null;
  youtube: YoutubePresence | null;
  web: WebPresence | null;
  /** True when we had no real data source (no Serper key AND Reddit unreachable). */
  limitedData: boolean;
}

export interface GatherOptions {
  fetchImpl?: typeof fetch;
  serperImpl?: typeof serperSearch;
  now?: Date;
  /** Skip the KV read/write (tests / when a fresh read is required). */
  noCache?: boolean;
}

const normalizeBrand = (s: string) => s.trim().toLowerCase();
const quoted = (s: string) => `"${s.replace(/"/g, "")}"`;

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// ── Reddit ────────────────────────────────────────────────────────────────
type RedditChild = { data?: { subreddit?: string; created_utc?: number } };

async function fetchRedditJson(
  brandName: string,
  fetchImpl: typeof fetch,
  now: Date,
): Promise<RedditPresence | null> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(
      quoted(brandName),
    )}&sort=new&limit=25&raw_json=1`;
    const res = await fetchImpl(url, {
      headers: { "User-Agent": REDDIT_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status !== 200) return null;
    const data = (await res.json()) as { data?: { children?: RedditChild[] } };
    const children = data.data?.children ?? [];
    if (!Array.isArray(children)) return null;
    const subs = new Set<string>();
    let recent = 0;
    for (const c of children) {
      const d = c.data;
      if (!d) continue;
      if (d.subreddit) subs.add(d.subreddit.toLowerCase());
      if (typeof d.created_utc === "number" && now.getTime() - d.created_utc * 1000 <= YEAR_MS) {
        recent++;
      }
    }
    return { mentions: children.length, recentMentions: recent, subreddits: subs.size, source: "api" };
  } catch {
    return null;
  }
}

async function fetchRedditViaSerper(
  brandName: string,
  serperImpl: typeof serperSearch,
): Promise<RedditPresence | null> {
  const r = await serperImpl(`site:reddit.com ${quoted(brandName)}`, { num: 10 });
  const hits = r.organic.length;
  if (hits === 0 && !r.knowledgeGraph) return null;
  const subs = new Set(r.organic.map((o) => o.link?.match(/reddit\.com\/r\/([^/]+)/i)?.[1]?.toLowerCase()).filter(Boolean));
  // Serper can't tell us recency, so treat relevance hits as recent mentions.
  return { mentions: hits, recentMentions: hits, subreddits: subs.size, source: "serper" };
}

// ── gather ──────────────────────────────────────────────────────────────────
export async function gatherOffsiteSignals(
  brandName: string,
  domain: string | null,
  opts: GatherOptions = {},
): Promise<OffsiteSignals> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const serperImpl = opts.serperImpl ?? serperSearch;
  const now = opts.now ?? new Date();
  const brand = brandName.trim();
  if (!brand) return { reddit: null, youtube: null, web: null, limitedData: true };

  const cacheKey = `brand:offsite:${normalizeBrand(brand)}:${domain ?? "-"}`;
  if (!opts.noCache) {
    const cached = await kvGetJson<OffsiteSignals>(cacheKey);
    if (cached) return cached;
  }

  const brandLower = normalizeBrand(brand);

  // Reddit: free JSON first (richest — dates + subreddits), Serper as fallback.
  let reddit = await fetchRedditJson(brand, fetchImpl, now);
  if (!reddit) reddit = await fetchRedditViaSerper(brand, serperImpl);

  // YouTube: presence of an official channel + video mentions.
  const yt = await serperImpl(`site:youtube.com ${quoted(brand)}`, { num: 10 });
  const youtube: YoutubePresence | null =
    yt.organic.length || yt.knowledgeGraph
      ? {
          officialChannel: yt.organic.some(
            (o) =>
              /youtube\.com\/(@|channel\/|c\/|user\/)/i.test(o.link ?? "") &&
              (o.title ?? "").toLowerCase().includes(brandLower),
          ),
          videoMentions: yt.organic.length,
        }
      : null;

  // Third-party web presence, knowledge graph, LinkedIn company page.
  const webQuery = domain ? `${quoted(brand)} -site:${domain}` : quoted(brand);
  const web = await serperImpl(webQuery, { num: 10 });
  const domainHost = domain ? hostOf(`https://${domain}`) : "";
  const webPresence: WebPresence | null =
    web.organic.length || web.knowledgeGraph
      ? {
          thirdPartyMentions: web.organic.filter((o) => {
            const h = hostOf(o.link);
            return h && h !== domainHost;
          }).length,
          knowledgeGraph: Boolean(
            web.knowledgeGraph && (web.knowledgeGraph.title ?? "").toLowerCase().includes(brandLower),
          ),
          linkedinCompany: web.organic.some((o) => /linkedin\.com\/company\//i.test(o.link ?? "")),
        }
      : null;

  // No real source responded at all → declared sameAs is all the caller has.
  const limitedData = reddit === null && youtube === null && webPresence === null;

  const signals: OffsiteSignals = { reddit, youtube, web: webPresence, limitedData };
  if (!opts.noCache && !limitedData) await kvPutJson(cacheKey, signals, OFFSITE_TTL_SECONDS);
  return signals;
}
