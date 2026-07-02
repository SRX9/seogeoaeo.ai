import { analyzeCrawlerAccess, type ContentSignalsResult } from "./crawler-access";
import { fetchPage } from "./fetch-page";
import { analyzeLlmsTxt, fetchLlmsTxt, generateLlmsTxt } from "./llms";
import { auditMeta, type MetaTagCheck } from "./meta-audit";
import { fetchRobots } from "./robots";
import type { Finding, Severity } from "./types";

/**
 * V1.5 — 60-second quick snapshot: one homepage fetch + robots + llms.txt,
 * then the deterministic V1.1–V1.4 analyzers and homepage schema/SSR presence.
 * Mirrors `/geo quick` (inspiration-code/docs/commands-reference.md). The
 * score is an approximation — the full audit computes the real one. A slot is
 * reserved for the V2.1 hero-block citability read once that ships.
 */

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Lightweight weighting over the signals available pre-V2. */
const QUICK_WEIGHTS = { crawlerAccess: 0.35, meta: 0.25, llmsTxt: 0.15, schema: 0.15, ssr: 0.1 };

export interface QuickResult {
  url: string;
  domain: string;
  fetchedAt: string;
  /** Always true — this is an estimate; run the full audit for the real score. */
  estimate: true;
  score: number;
  signals: {
    crawlerAccess: { score: number; blocked: string[]; sitemapReferenced: boolean };
    contentSignals: Pick<ContentSignalsResult, "status" | "explanation">;
    llmsTxt: { exists: boolean; formatValid: boolean; score: number };
    meta: { score: number; checks: MetaTagCheck[] };
    schema: { jsonLdCount: number };
    ssr: { hasSsrContent: boolean };
  };
  /** Top 3–5 gaps, most severe first — feeds the public result + CRM flow. */
  topGaps: Finding[];
  error?: string;
}

export async function quickSnapshot(
  url: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<QuickResult> {
  const target = new URL(url);
  const result: QuickResult = {
    url: target.toString(),
    domain: target.hostname,
    fetchedAt: new Date().toISOString(),
    estimate: true,
    score: 0,
    signals: {
      crawlerAccess: { score: 0, blocked: [], sitemapReferenced: false },
      contentSignals: { status: "recommendation", explanation: "" },
      llmsTxt: { exists: false, formatValid: false, score: 0 },
      meta: { score: 0, checks: [] },
      schema: { jsonLdCount: 0 },
      ssr: { hasSsrContent: true },
    },
    topGaps: [],
  };

  const [homepage, robots, llmsFetched] = await Promise.all([
    fetchPage(target.toString(), { timeoutMs: 20_000, fetchImpl: opts.fetchImpl }),
    fetchRobots(target.toString(), { fetchImpl: opts.fetchImpl }),
    fetchLlmsTxt(target.toString(), { fetchImpl: opts.fetchImpl }),
  ]);

  if (homepage.status_code === null || homepage.status_code >= 400) {
    result.error =
      homepage.errors[0] ?? `Homepage returned status ${homepage.status_code}`;
    return result;
  }

  const crawlerAccess = analyzeCrawlerAccess(robots);
  const llms = analyzeLlmsTxt(llmsFetched);
  const meta = auditMeta(homepage);

  // llms.txt missing → generate the concise file from the already-fetched
  // homepage HTML (zero extra requests) so the finding carries a real fix.
  const findings = [...crawlerAccess.findings, ...meta.findings];
  if (!llms.exists) {
    const generated = await generateLlmsTxt(target.toString(), {
      homepageHtml: homepage.html,
      includeFull: false,
    });
    findings.push(generated.finding ?? llms.findings[0]);
  } else {
    findings.push(...llms.findings);
  }

  const jsonLdCount = homepage.structured_data.length;
  if (jsonLdCount === 0) {
    findings.push({
      pillar: "seo",
      category: "schema",
      severity: "medium",
      title: "No structured data on the homepage",
      recommendation:
        "Add JSON-LD (Organization or WebSite) so search engines and AI understand who you are.",
      fix_capability: "artifact",
    });
  }
  if (!homepage.has_ssr_content) {
    findings.push({
      pillar: "geo",
      category: "rendering",
      severity: "critical",
      title: "AI assistants can't read this page",
      recommendation:
        "The page renders client-side only. AI crawlers don't run JavaScript — enable server-side rendering or prerendering.",
      fix_capability: "guided",
    });
  }

  result.signals = {
    crawlerAccess: {
      score: crawlerAccess.score,
      blocked: crawlerAccess.crawlers.filter((c) => c.blocked).map((c) => c.crawler),
      sitemapReferenced: crawlerAccess.sitemapReferenced,
    },
    contentSignals: {
      status: crawlerAccess.contentSignals.status,
      explanation: crawlerAccess.contentSignals.explanation,
    },
    llmsTxt: { exists: llms.exists, formatValid: llms.format_valid, score: llms.score },
    meta: { score: meta.score, checks: meta.checks },
    schema: { jsonLdCount },
    ssr: { hasSsrContent: homepage.has_ssr_content },
  };

  result.score = Math.round(
    crawlerAccess.score * QUICK_WEIGHTS.crawlerAccess +
      meta.score * QUICK_WEIGHTS.meta +
      llms.score * QUICK_WEIGHTS.llmsTxt +
      (jsonLdCount > 0 ? 100 : 0) * QUICK_WEIGHTS.schema +
      (homepage.has_ssr_content ? 100 : 0) * QUICK_WEIGHTS.ssr,
  );

  result.topGaps = findings
    .filter(Boolean)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 5);

  return result;
}
