/**
 * Shared types for the visibility suite (Phase V0+). `PageSnapshot` mirrors the
 * `result` dict of `inspiration-code/scripts/fetch_page.py` field-for-field so
 * the deterministic scorers ported later stay 1:1 with the source of truth.
 */

export interface RedirectHop {
  url: string;
  status: number;
}

export interface HeadingEntry {
  level: number;
  text: string;
}

export interface LinkEntry {
  url: string;
  text: string;
}

export interface ImageEntry {
  src: string;
  alt: string;
  width: string | null;
  height: string | null;
  loading: string | null;
}

export interface PageSnapshot {
  url: string;
  status_code: number | null;
  redirect_chain: RedirectHop[];
  headers: Record<string, string>;
  meta_tags: Record<string, string>;
  title: string | null;
  description: string | null;
  canonical: string | null;
  h1_tags: string[];
  heading_structure: HeadingEntry[];
  word_count: number;
  text_content: string;
  internal_links: LinkEntry[];
  external_links: LinkEntry[];
  images: ImageEntry[];
  structured_data: unknown[];
  has_ssr_content: boolean;
  security_headers: Record<string, string | null>;
  errors: string[];
  /** Raw HTML, kept for downstream analyzers (block splitter, schema detect). */
  html: string;
}

export type AiCrawlerStatus =
  | "BLOCKED"
  | "PARTIALLY_BLOCKED"
  | "ALLOWED"
  | "BLOCKED_BY_WILDCARD"
  | "ALLOWED_BY_DEFAULT"
  | "NOT_MENTIONED"
  | "NO_ROBOTS_TXT";

export interface RobotsRule {
  directive: "Allow" | "Disallow";
  path: string;
}

export interface RobotsResult {
  url: string;
  exists: boolean;
  content: string;
  agent_rules: Record<string, RobotsRule[]>;
  ai_crawler_status: Record<string, AiCrawlerStatus>;
  sitemaps: string[];
  errors: string[];
}

export interface SitemapResult {
  pages: string[];
  errors: string[];
}

export interface LlmsTxtFile {
  url: string;
  exists: boolean;
  content: string;
}

export interface LlmsTxtResult {
  llms_txt: LlmsTxtFile;
  llms_full_txt: LlmsTxtFile;
  errors: string[];
}

export interface ContentBlock {
  heading: string | null;
  content: string;
  word_count: number;
}

export type BusinessType =
  | "saas"
  | "local"
  | "ecommerce"
  | "publisher"
  | "agency"
  | "other";

export interface BusinessTypeResult {
  type: BusinessType;
  confidence: number;
  /** Signals matched per type, for debugging + LLM-fallback decisions. */
  matches: Record<BusinessType, string[]>;
}

export type Pillar = "seo" | "aeo" | "geo";
export type Severity = "critical" | "high" | "medium" | "low";
export type FixCapability = "auto" | "artifact" | "guided";

export interface Finding {
  pillar: Pillar;
  category: string;
  severity: Severity;
  title: string;
  recommendation: string;
  fix_capability?: FixCapability;
  fix_payload?: unknown;
}

export interface SubScore {
  key: "citability" | "brand" | "eeat" | "technical" | "schema" | "platform";
  score: number | null;
}

export interface AnalyzerResult {
  subScore: SubScore;
  findings: Finding[];
}

export interface AuditResult {
  auditId: string;
  siteUrl: string;
  businessType: BusinessType;
  status: "running" | "complete" | "failed";
  overallScore: number | null;
  subScores: SubScore[];
  findings: Finding[];
  discoveredUrls: string[];
}
