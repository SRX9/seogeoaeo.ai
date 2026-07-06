import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";
import { logError } from "@/lib/logging/logger";

/**
 * Google PageSpeed Insights v5 client — real Lighthouse lab scores plus CrUX
 * field data for the Site Health checklist. Never throws: any failure (missing
 * key, timeout, quota, parse error) returns null so callers fall back to the
 * static CWV heuristic in `technical.ts`. Responses are KV-cached for 6h so an
 * audit and an on-demand refresh within the window share one API call.
 */

export interface PsiOpportunity {
  id: string;
  title: string;
  displayValue?: string;
  savingsMs?: number;
}

export type CruxRating = "FAST" | "AVERAGE" | "SLOW";

export interface PsiResult {
  strategy: "mobile";
  fetchedAt: string;
  /** Lighthouse category scores, 0–100. */
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  /** CrUX field data — null when Chrome has no real-user data for the URL/origin. */
  fieldData: {
    lcpMs: number | null;
    inpMs: number | null;
    cls: number | null;
    ratings: { lcp?: CruxRating; inp?: CruxRating; cls?: CruxRating };
  } | null;
  /** Lab (Lighthouse) metrics from the simulated mobile run. */
  lab: { lcpMs: number | null; cls: number | null; tbtMs: number | null };
  /** Top improvement opportunities, biggest estimated savings first. */
  opportunities: PsiOpportunity[];
}

const PSI_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CACHE_TTL_SECONDS = 21_600; // 6h — balances freshness against the shared daily quota.
const REQUEST_TIMEOUT_MS = 60_000; // PSI runs a full Lighthouse pass; 10–30s is normal.
const MAX_OPPORTUNITIES = 5;

export function isPsiConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PSI_API_KEY);
}

const categoryScore = (categories: Record<string, unknown>, key: string): number | null => {
  const score = (categories[key] as { score?: unknown } | undefined)?.score;
  return typeof score === "number" ? Math.round(score * 100) : null;
};

const metricNumber = (metric: unknown): number | null => {
  const value = (metric as { percentile?: unknown } | undefined)?.percentile;
  return typeof value === "number" ? value : null;
};

const metricRating = (metric: unknown): CruxRating | undefined => {
  const category = (metric as { category?: unknown } | undefined)?.category;
  return category === "FAST" || category === "AVERAGE" || category === "SLOW"
    ? category
    : undefined;
};

const auditNumber = (audits: Record<string, unknown>, key: string): number | null => {
  const value = (audits[key] as { numericValue?: unknown } | undefined)?.numericValue;
  return typeof value === "number" ? value : null;
};

function extractOpportunities(audits: Record<string, unknown>): PsiOpportunity[] {
  const opportunities: Array<{ opportunity: PsiOpportunity; savings: number }> = [];
  for (const [id, raw] of Object.entries(audits)) {
    const audit = raw as {
      title?: unknown;
      score?: unknown;
      displayValue?: unknown;
      details?: { type?: unknown; overallSavingsMs?: unknown };
    };
    if (audit.details?.type !== "opportunity") continue;
    if (typeof audit.score !== "number" || audit.score >= 0.9) continue;
    const savings =
      typeof audit.details.overallSavingsMs === "number" ? audit.details.overallSavingsMs : 0;
    opportunities.push({
      savings,
      opportunity: {
        id,
        title: typeof audit.title === "string" ? audit.title : id,
        ...(typeof audit.displayValue === "string" ? { displayValue: audit.displayValue } : {}),
        ...(savings > 0 ? { savingsMs: Math.round(savings) } : {}),
      },
    });
  }
  return opportunities
    .sort((a, b) => b.savings - a.savings)
    .slice(0, MAX_OPPORTUNITIES)
    .map((entry) => entry.opportunity);
}

/** Parse the PSI v5 response body into the compact shape we store. */
export function parsePsiResponse(body: unknown): PsiResult {
  const root = (body ?? {}) as {
    lighthouseResult?: { categories?: Record<string, unknown>; audits?: Record<string, unknown> };
    loadingExperience?: { metrics?: Record<string, unknown> };
  };
  const categories = root.lighthouseResult?.categories ?? {};
  const audits = root.lighthouseResult?.audits ?? {};
  const fieldMetrics = root.loadingExperience?.metrics ?? {};

  const lcpField = fieldMetrics["LARGEST_CONTENTFUL_PAINT_MS"];
  const inpField = fieldMetrics["INTERACTION_TO_NEXT_PAINT"];
  const clsField = fieldMetrics["CUMULATIVE_LAYOUT_SHIFT_SCORE"];
  const hasField = Boolean(lcpField || inpField || clsField);
  const clsPercentile = metricNumber(clsField);

  return {
    strategy: "mobile",
    fetchedAt: new Date().toISOString(),
    scores: {
      performance: categoryScore(categories, "performance"),
      accessibility: categoryScore(categories, "accessibility"),
      bestPractices: categoryScore(categories, "best-practices"),
      seo: categoryScore(categories, "seo"),
    },
    fieldData: hasField
      ? {
          lcpMs: metricNumber(lcpField),
          inpMs: metricNumber(inpField),
          // CrUX reports CLS ×100 as an integer percentile.
          cls: clsPercentile == null ? null : clsPercentile / 100,
          ratings: {
            ...(metricRating(lcpField) ? { lcp: metricRating(lcpField) } : {}),
            ...(metricRating(inpField) ? { inp: metricRating(inpField) } : {}),
            ...(metricRating(clsField) ? { cls: metricRating(clsField) } : {}),
          },
        }
      : null,
    lab: {
      lcpMs: auditNumber(audits, "largest-contentful-paint"),
      cls: auditNumber(audits, "cumulative-layout-shift"),
      tbtMs: auditNumber(audits, "total-blocking-time"),
    },
    opportunities: extractOpportunities(audits),
  };
}

/**
 * Run PageSpeed Insights (mobile) for a URL. Returns the KV-cached result when
 * fresh; null when the key is missing or the API call fails for any reason.
 */
export async function fetchPageSpeed(
  url: string,
  opts: { noCache?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<PsiResult | null> {
  const apiKey = process.env.GOOGLE_PSI_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `psi:mobile:${url}`;
  if (!opts.noCache) {
    const cached = await kvGetJson<PsiResult>(cacheKey);
    if (cached) return cached;
  }

  const params = new URLSearchParams({ url, strategy: "mobile", key: apiKey });
  for (const category of ["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]) {
    params.append("category", category);
  }

  try {
    const fetchImpl = opts.fetchImpl ?? fetch;
    const res = await fetchImpl(`${PSI_ENDPOINT}?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      logError("visibility.psi_failed", { url, status: res.status });
      return null;
    }
    const result = parsePsiResponse(await res.json());
    await kvPutJson(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  } catch (error) {
    logError("visibility.psi_failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
