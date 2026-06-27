export type ResearchSourceType =
  | "web_search"
  | "rss"
  | "sitemap"
  | "trend_query"
  | "keyword_api";

export type ResearchFinding = {
  title: string;
  query?: string;
  source: string;
  sourceType: ResearchSourceType;
  evidenceUrls: string[];
  snippet?: string;
};

export type ResearchContext = {
  brand: {
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
};

export interface ResearchProvider {
  id: string;
  isAvailable(): boolean;
  discover(context: ResearchContext): Promise<ResearchFinding[]>;
}
