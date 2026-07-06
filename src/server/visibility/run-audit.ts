import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  auditPages,
  audits,
  brandSignals,
  platformScores,
} from "@/lib/db/schema/visibility";
import { persistNewFindings } from "@/lib/visibility/findings-repository";
import { collectSameAs, scanBrand } from "@/lib/visibility/brand";
import { classifyBusinessType } from "@/lib/visibility/business-type";
import { analyzePageCitability } from "@/lib/visibility/citability";
import { analyzeFreshness } from "@/lib/visibility/content";
import { analyzeCrawlerAccess } from "@/lib/visibility/crawler-access";
import { logError } from "@/lib/logging/logger";
import { fetchPage } from "@/lib/visibility/fetch-page";
import { analyzeLlmsTxt, fetchLlmsTxt } from "@/lib/visibility/llms";
import { analyzePlatforms } from "@/lib/visibility/platforms";
import { fetchPageSpeed, isPsiConfigured } from "@/lib/visibility/pagespeed";
import { fetchPageResilient } from "@/lib/visibility/resilient-fetch";
import { fetchRobots } from "@/lib/visibility/robots";
import { buildSiteHealth, type SiteHealthSnapshot } from "@/lib/visibility/site-health";
import { siteHints } from "@/lib/visibility/schema/generate";
import { computeAiVisibility, computeComposite } from "@/lib/visibility/scoring";
import { crawlSitemap } from "@/lib/visibility/sitemap";
import { seedToolRunsFromAudit } from "@/lib/visibility/toolbox-seed";
import type {
  AnalyzerResult,
  PageSnapshot,
  RobotsResult,
} from "@/lib/visibility/types";
import { SCORER_VERSION } from "@/lib/visibility/version";
import { analyzers } from "./analyzers";

/**
 * V0.3 — audit orchestrator: Discovery → Analysis → Synthesis, mirroring the
 * inspiration skill's 3-phase flow (`inspiration-code/geo/SKILL.md` →
 * "Orchestration Logic"). Analyzers are stubs until V2+.
 */

/** Quality gates from geo/SKILL.md → "Quality Gates". */
export const QUALITY_GATES = {
  maxPages: 50,
  maxConcurrent: 5,
  requestSpacingMs: 1_000,
  pageTimeoutMs: 30_000,
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Honor robots.txt: check the wildcard group's rules for a URL's path. */
export function isAllowedByRobots(robots: RobotsResult, url: string): boolean {
  const rules = robots.agent_rules["*"];
  if (!rules) return true;
  const pathname = new URL(url).pathname;
  let verdict = true;
  let matchLength = -1;
  for (const rule of rules) {
    if (!rule.path) continue;
    if (pathname.startsWith(rule.path) && rule.path.length > matchLength) {
      matchLength = rule.path.length;
      verdict = rule.directive === "Allow";
    }
  }
  return verdict;
}

/**
 * Fan-out page fetcher enforcing the quality gates: ≤maxPages, ≤maxConcurrent
 * in flight, ~1s between request starts, 30s per page.
 */
export async function fetchPagesWithGates(
  urls: string[],
  opts: { fetchImpl?: typeof fetch; spacingMs?: number } = {},
): Promise<PageSnapshot[]> {
  const results: PageSnapshot[] = [];
  const active = new Set<Promise<void>>();
  const spacingMs = opts.spacingMs ?? QUALITY_GATES.requestSpacingMs;

  for (const url of urls.slice(0, QUALITY_GATES.maxPages)) {
    while (active.size >= QUALITY_GATES.maxConcurrent) {
      await Promise.race(active);
    }
    const task: Promise<void> = fetchPage(url, {
      timeoutMs: QUALITY_GATES.pageTimeoutMs,
      fetchImpl: opts.fetchImpl,
    })
      .then((snapshot) => {
        results.push(snapshot);
      })
      .finally(() => active.delete(task));
    active.add(task);
    if (spacingMs > 0) await sleep(spacingMs);
  }
  await Promise.all(active);
  return results;
}

async function persistPage(auditId: string, snapshot: PageSnapshot) {
  const db = getDb();
  const { html, ...rest } = snapshot;
  const [row] = await db
    .insert(auditPages)
    .values({
      auditId,
      url: snapshot.url,
      htmlHash: html ? await sha256Hex(html) : null,
      statusCode: snapshot.status_code,
      meta: snapshot.meta_tags,
      headings: snapshot.heading_structure,
      wordCount: snapshot.word_count,
      hasSsrContent: snapshot.has_ssr_content,
      snapshot: rest,
    })
    .returning({ id: auditPages.id });
  return row.id;
}

/** Persist V5.1 brand_signals + V5.2 platform_scores detail rows. */
async function persistOffSiteSignals(
  auditId: string,
  brand: Awaited<ReturnType<typeof scanBrand>>,
  platforms: ReturnType<typeof analyzePlatforms>,
): Promise<void> {
  const db = getDb();
  // Drizzle throws "No values to insert" on `.values([])`, so guard each insert —
  // brands with no detected social presence yield empty arrays.
  if (brand.platforms.length) {
    await db.insert(brandSignals).values(
      brand.platforms.map((p) => ({
        auditId,
        platform: p.platform,
        status: p.detected ? "present" : "absent",
        score: p.earned,
        evidence: { weight: p.weight, searchUrl: p.searchUrl, ...p.evidence },
      })),
    );
  }
  if (platforms.platforms.length) {
    await db.insert(platformScores).values(
      platforms.platforms.map((p) => ({
        auditId,
        platform: p.platform,
        score: p.score,
        breakdown: p.breakdown,
      })),
    );
  }
}

/** owned = the workspace's own site; benchmark = a competitor scored for comparison. */
export type AuditKind = "owned" | "benchmark";

/** Create the audit row; the caller decides whether to await execution. */
export async function createAudit(
  workspaceId: string,
  siteUrl: string,
  kind: AuditKind = "owned",
): Promise<string> {
  const db = getDb();
  const previous = await db.query.audits.findFirst({
    where: (table, { and, eq: eqOp }) =>
      and(eqOp(table.workspaceId, workspaceId), eqOp(table.siteUrl, siteUrl)),
    orderBy: (table, { desc }) => desc(table.runVersion),
    columns: { runVersion: true },
  });
  const [row] = await db
    .insert(audits)
    .values({ workspaceId, siteUrl, kind, runVersion: (previous?.runVersion ?? 0) + 1 })
    .returning({ id: audits.id });
  return row.id;
}

/** Remove an audit row that never started (e.g. the credit charge failed). */
export async function deleteAudit(auditId: string): Promise<void> {
  const db = getDb();
  await db.delete(audits).where(eq(audits.id, auditId));
}

/**
 * Run the 3 stages for an existing audit row. Never throws — failures land in the
 * row. Returns `true` only when the audit completed, so callers can charge credits
 * for successful work and skip charging for failures.
 */
export async function executeAudit(auditId: string, siteUrl: string): Promise<boolean> {
  const db = getDb();
  const auditRow = await db.query.audits.findFirst({
    where: eq(audits.id, auditId),
    columns: { workspaceId: true, kind: true, status: true },
  });
  const workspaceId = auditRow?.workspaceId ?? null;
  const isBenchmark = auditRow?.kind === "benchmark";

  // Retry-safe under at-least-once Workflow delivery: a retry after a lost
  // response must not redo a settled audit (full re-scrape + LLM spend), and a
  // retry after a mid-run kill must not accumulate duplicate detail rows —
  // wipe partials and start clean. (Findings are already deduped downstream by
  // persistNewFindings.)
  if (auditRow?.status === "complete") return true;
  if (auditRow?.status === "failed") return false;
  await Promise.all([
    db.delete(auditPages).where(eq(auditPages.auditId, auditId)),
    db.delete(brandSignals).where(eq(brandSignals.auditId, auditId)),
    db.delete(platformScores).where(eq(platformScores.auditId, auditId)),
  ]);

  try {
    // ── Discovery ────────────────────────────────────────────────────────
    // Resilient fetch: plain fetch first, escalating to the scraper chain
    // (context.dev → Firecrawl) when the homepage is bot-blocked or client-
    // rendered, so we score the real page and never a challenge interstitial.
    // It also returns the true SSR verdict (raw-vs-rendered) and sets
    // has_ssr_content; all degrade gracefully when no scraper is configured.
    const { snapshot: homepage, render, blocked, recovered } = await fetchPageResilient(siteUrl, {
      timeoutMs: QUALITY_GATES.pageTimeoutMs,
    });
    if (!recovered && (homepage.status_code === null || homepage.status_code >= 400)) {
      throw new Error(
        homepage.errors[0] ?? `Homepage returned status ${homepage.status_code}`,
      );
    }
    // Fetch robots first so sitemap discovery can honor its `Sitemap:` directives.
    const robots = await fetchRobots(siteUrl);
    const [sitemapPages, llms, businessType] = await Promise.all([
      crawlSitemap(siteUrl, QUALITY_GATES.maxPages, { sitemaps: robots.sitemaps }),
      fetchLlmsTxt(siteUrl),
      classifyBusinessType(homepage),
    ]);
    await persistPage(auditId, homepage);

    const homepageUrl = new URL(siteUrl).toString();
    const discoveredUrls = sitemapPages
      .filter((url) => url !== homepageUrl && url !== siteUrl)
      .filter((url) => isAllowedByRobots(robots, url))
      .slice(0, QUALITY_GATES.maxPages);

    await db
      .update(audits)
      .set({
        businessType: businessType.type,
        discovery: {
          discovered_urls: discoveredUrls,
          robots: { ...robots, content: robots.content.slice(0, 10_000) },
          llms: {
            llms_txt: { ...llms.llms_txt, content: llms.llms_txt.content.slice(0, 10_000) },
            llms_full_txt: { ...llms.llms_full_txt, content: "" },
          },
          business_type: businessType,
        },
      })
      .where(eq(audits.id, auditId));

    // Fan-out over discovered pages (gated), persisting the valid ones.
    const pages = await fetchPagesWithGates(discoveredUrls);
    for (const page of pages) {
      if (page.status_code !== null && page.status_code < 400) {
        await persistPage(auditId, page);
      }
    }

    // Off-site signals (V5.1/V5.2) — computed once and shared by both analyzers.
    const brand = await scanBrand(siteHints(homepage).name, new URL(siteUrl).host, {
      sameAsUrls: collectSameAs(homepage.structured_data),
    });
    // Computed once and reused below for the AI-visibility rollup.
    const crawlerScore = analyzeCrawlerAccess(robots).score;
    const platforms = analyzePlatforms({
      snapshot: homepage,
      brand,
      citabilityScore: analyzePageCitability(homepage.html).page_score,
      crawlerScore,
      freshnessScore: analyzeFreshness(homepage).score,
    });
    await persistOffSiteSignals(auditId, brand, platforms);

    // ── Analysis (parallel, mirrors the 6 subagents) ─────────────────────
    // PageSpeed runs a full Lighthouse pass (~10–30s) — start it alongside
    // the analyzers so it never adds wall-clock time to the audit.
    const [analyzerResults, psi] = await Promise.all([
      Promise.all(
        analyzers.map((run) =>
          run({ homepage, pages, robots, llms, businessType: businessType.type, brand, platforms, render }),
        ),
      ) as Promise<AnalyzerResult[]>,
      isPsiConfigured() ? fetchPageSpeed(homepage.url) : Promise.resolve(null),
    ]);

    // ── Synthesis ────────────────────────────────────────────────────────
    // Missing analyzers count as 0 so partial audits still yield a composite.
    const composite = computeComposite(analyzerResults.map((r) => r.subScore));
    const subScores = new Map(analyzerResults.map((r) => [r.subScore.key, r.subScore.score]));
    const aiVisibility = computeAiVisibility({
      citability: subScores.get("citability") ?? 0,
      brand: subScores.get("brand") ?? 0,
      crawler: crawlerScore,
      llmstxt: analyzeLlmsTxt(llms).score,
    });

    const findings = analyzerResults.flatMap((r) => r.findings);

    // ── Site Health checklist (V9) — never fails the audit ───────────────
    let siteHealth: SiteHealthSnapshot | null = null;
    try {
      const health = await buildSiteHealth({
        homepage,
        robots,
        llms,
        sitemapPageCount: sitemapPages.length,
        render,
        psi,
        source: "audit",
      });
      siteHealth = health.snapshot;
      // Net-new checks (favicon, logo, og:image, sitemap, PageSpeed) feed the
      // fix queue through the same gate as the analyzers' findings below.
      findings.push(...health.findings);
    } catch (error) {
      logError("visibility.site_health_failed", {
        auditId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (blocked) {
      // The plain fetch hit bot protection; AI crawlers fetch like plain requests.
      findings.push({
        pillar: "geo",
        category: "crawler_access",
        severity: "high",
        title: "Live page blocked non-browser requests",
        recommendation:
          "A plain request to your page was met with a bot-protection challenge. AI crawlers " +
          "(GPTBot, ClaudeBot, PerplexityBot) fetch like plain requests too — allowlist them in your " +
          "WAF / Bot Fight Mode, or they'll see a challenge page instead of your content.",
        fix_capability: "guided",
      });
    }
    // Benchmark (competitor) audits keep their scores but never write findings:
    // the fix queue is the owner's to-do list, and a rival's robots/llms/schema
    // fixes must not surface there (nor be auto-applied).
    if (findings.length > 0 && workspaceId && !isBenchmark) {
      await persistNewFindings(workspaceId, findings, { auditId });
    }

    // Seed each Toolbox tool's latest run from this audit's data so the tool
    // pages open on Claudia's results (setup run and recurring audits alike).
    // Owned sites only — a competitor's results must never populate the
    // owner's tools — and never fatal to the audit.
    if (workspaceId && !isBenchmark) {
      try {
        await seedToolRunsFromAudit({
          workspaceId,
          siteUrl,
          homepage,
          robots,
          llms,
          businessType: businessType.type,
        });
      } catch (error) {
        logError("visibility.tool_seed_failed", {
          auditId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await db
      .update(audits)
      .set({
        status: "complete",
        overallScore: composite.overall,
        aiVisibilityScore: aiVisibility,
        citabilityScore: subScores.get("citability") ?? null,
        brandScore: subScores.get("brand") ?? null,
        eeatScore: subScores.get("eeat") ?? null,
        technicalScore: subScores.get("technical") ?? null,
        schemaScore: subScores.get("schema") ?? null,
        platformScore: subScores.get("platform") ?? null,
        siteHealth,
        scorerVersion: SCORER_VERSION,
        completedAt: new Date(),
      })
      .where(eq(audits.id, auditId));
    return true;
  } catch (error) {
    // Server-side signal for ops dashboards — the failed row alone is silent.
    logError("visibility.audit_failed", {
      auditId,
      siteUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    await db
      .update(audits)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      })
      .where(eq(audits.id, auditId));
    return false;
  }
}

/** Create + execute an audit end-to-end. Returns the audit id when done. */
export async function runAudit(
  workspaceId: string,
  siteUrl: string,
  kind: AuditKind = "owned",
): Promise<string> {
  const auditId = await createAudit(workspaceId, siteUrl, kind);
  await executeAudit(auditId, siteUrl);
  return auditId;
}
