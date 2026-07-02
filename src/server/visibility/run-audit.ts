import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  auditFindings,
  auditPages,
  audits,
  brandSignals,
  platformScores,
} from "@/lib/db/schema/visibility";
import { collectSameAs, scanBrand } from "@/lib/visibility/brand";
import { classifyBusinessType } from "@/lib/visibility/business-type";
import { analyzePageCitability } from "@/lib/visibility/citability";
import { analyzeFreshness } from "@/lib/visibility/content";
import { analyzeCrawlerAccess } from "@/lib/visibility/crawler-access";
import { fetchPage } from "@/lib/visibility/fetch-page";
import { analyzeLlmsTxt, fetchLlmsTxt } from "@/lib/visibility/llms";
import { analyzePlatforms } from "@/lib/visibility/platforms";
import { fetchRobots } from "@/lib/visibility/robots";
import { siteHints } from "@/lib/visibility/schema/generate";
import { computeAiVisibility, computeComposite } from "@/lib/visibility/scoring";
import { crawlSitemap } from "@/lib/visibility/sitemap";
import type {
  AnalyzerResult,
  PageSnapshot,
  RobotsResult,
} from "@/lib/visibility/types";
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
  await db.insert(brandSignals).values(
    brand.platforms.map((p) => ({
      auditId,
      platform: p.platform,
      status: p.detected ? "present" : "absent",
      score: p.earned,
      evidence: { weight: p.weight, searchUrl: p.searchUrl },
    })),
  );
  await db.insert(platformScores).values(
    platforms.platforms.map((p) => ({
      auditId,
      platform: p.platform,
      score: p.score,
      breakdown: p.breakdown,
    })),
  );
}

/** Create the audit row; the caller decides whether to await execution. */
export async function createAudit(workspaceId: string, siteUrl: string): Promise<string> {
  const db = getDb();
  const previous = await db.query.audits.findFirst({
    where: (table, { and, eq: eqOp }) =>
      and(eqOp(table.workspaceId, workspaceId), eqOp(table.siteUrl, siteUrl)),
    orderBy: (table, { desc }) => desc(table.runVersion),
    columns: { runVersion: true },
  });
  const [row] = await db
    .insert(audits)
    .values({ workspaceId, siteUrl, runVersion: (previous?.runVersion ?? 0) + 1 })
    .returning({ id: audits.id });
  return row.id;
}

/** Run the 3 stages for an existing audit row. Never throws — failures land in the row. */
export async function executeAudit(auditId: string, siteUrl: string): Promise<void> {
  const db = getDb();
  const auditRow = await db.query.audits.findFirst({
    where: eq(audits.id, auditId),
    columns: { workspaceId: true },
  });
  const workspaceId = auditRow?.workspaceId ?? null;
  try {
    // ── Discovery ────────────────────────────────────────────────────────
    const homepage = await fetchPage(siteUrl, { timeoutMs: QUALITY_GATES.pageTimeoutMs });
    if (homepage.status_code === null || homepage.status_code >= 400) {
      throw new Error(
        homepage.errors[0] ?? `Homepage returned status ${homepage.status_code}`,
      );
    }
    const [robots, sitemapPages, llms, businessType] = await Promise.all([
      fetchRobots(siteUrl),
      crawlSitemap(siteUrl, QUALITY_GATES.maxPages),
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
    const platforms = analyzePlatforms({
      snapshot: homepage,
      brand,
      citabilityScore: analyzePageCitability(homepage.html).page_score,
      crawlerScore: analyzeCrawlerAccess(robots).score,
      freshnessScore: analyzeFreshness(homepage).score,
    });
    await persistOffSiteSignals(auditId, brand, platforms);

    // ── Analysis (parallel, mirrors the 6 subagents) ─────────────────────
    const analyzerResults: AnalyzerResult[] = await Promise.all(
      analyzers.map((run) =>
        run({ homepage, pages, robots, llms, businessType: businessType.type, brand, platforms }),
      ),
    );

    // ── Synthesis ────────────────────────────────────────────────────────
    // Missing analyzers count as 0 so partial audits still yield a composite.
    const composite = computeComposite(analyzerResults.map((r) => r.subScore));
    const subScores = new Map(analyzerResults.map((r) => [r.subScore.key, r.subScore.score]));
    const aiVisibility = computeAiVisibility({
      citability: subScores.get("citability") ?? 0,
      brand: subScores.get("brand") ?? 0,
      crawler: analyzeCrawlerAccess(robots).score,
      llmstxt: analyzeLlmsTxt(llms).score,
    });

    const findings = analyzerResults.flatMap((r) => r.findings);
    if (findings.length > 0) {
      await db.insert(auditFindings).values(
        findings.map((f) => ({
          workspaceId,
          auditId,
          pillar: f.pillar,
          category: f.category,
          severity: f.severity,
          title: f.title,
          recommendation: f.recommendation,
          fixCapability: f.fix_capability ?? null,
          fixPayload: f.fix_payload ?? null,
        })),
      );
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
        completedAt: new Date(),
      })
      .where(eq(audits.id, auditId));
  } catch (error) {
    await db
      .update(audits)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      })
      .where(eq(audits.id, auditId));
  }
}

/** Create + execute an audit end-to-end. Returns the audit id when done. */
export async function runAudit(workspaceId: string, siteUrl: string): Promise<string> {
  const auditId = await createAudit(workspaceId, siteUrl);
  await executeAudit(auditId, siteUrl);
  return auditId;
}
