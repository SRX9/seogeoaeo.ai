export type ResearchSourceType =
  | "web_search"
  | "rss"
  | "sitemap"
  | "trend_query"
  | "keyword_api"
  | "use_case"
  | "competitor_gap"
  /** C2: mined from the brand's own Search Console query report. */
  | "gsc_query";

/** C1 buyer-intent tiers: the first ranking key for the backlog. */
export type IntentTier = "bofu" | "mofu" | "tofu";

export type ResearchFinding = {
  title: string;
  query?: string;
  source: string;
  sourceType: ResearchSourceType;
  evidenceUrls: string[];
  snippet?: string;
  /** Buyer intent, when the provider knows it (target-profile/competitor findings do). */
  intentTier?: IntentTier;
  /** One owner-readable line: why this topic will drive traffic. */
  thesis?: string;
};

export type ResearchContext = {
  brand: {
    name?: string | null;
    productDescription?: string | null;
    audience?: string | null;
    tone?: string | null;
    website?: string | null;
    seedKeywords?: string | null;
  };
  competitors: Array<{
    name: string;
    url: string;
    rssUrl?: string | null;
    sitemapUrl?: string | null;
  }>;
  seedQueries: string[];
  /** Enabled rows from the C1 target-profile inventory. */
  useCases: Array<{ job: string; persona: string; industry?: string | null }>;
  /** Titles of every topic/article we already have: for gap diffs. */
  ourTitles: string[];
  /** Set by runResearch for providers that persist (competitor index). */
  scope?: { workspaceId: string; brandId: string };
};

export type ScoredTopic = {
  title: string;
  angle?: string;
  keywords?: string;
  score: number;
  rationale: string;
  answerFit: string;
  source: string;
  sourceType: ResearchSourceType;
  evidenceUrls: string[];
  query?: string;
  intentTier?: IntentTier;
  thesis?: string;
};

export interface ResearchProvider {
  id: string;
  isAvailable(): boolean;
  discover(context: ResearchContext): Promise<ResearchFinding[]>;
}
