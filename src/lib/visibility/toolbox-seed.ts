import { getDb } from "@/lib/db";
import { toolRuns } from "@/lib/db/schema/visibility";
import { analyzePageCitability } from "./citability";
import { analyzeCrawlerAccess, parseContentSignals } from "./crawler-access";
import { analyzeLlmsTxt } from "./llms";
import { logError } from "@/lib/logging/logger";
import { auditMeta } from "./meta-audit";
import { detectSchema } from "./schema/detect";
import { generateSchema } from "./schema/generate";
import { scoreSchema } from "./schema/score";
import { validateSchema } from "./schema/validate";
import { auditTechnical } from "./technical";
import type { BusinessType, LlmsTxtResult, PageSnapshot, RobotsResult } from "./types";

/**
 * Seed a `tool_runs` row for every Toolbox tool from data an audit already
 * fetched, so each tool page opens on Claudia's latest result instead of an
 * empty runner. Runs after every *owned* audit (setup run and recurring runs
 * alike) — plan-included work, so nothing here charges credits, and findings
 * are not re-persisted (the audit's analyzers already pushed them through
 * `persistNewFindings`).
 *
 * Each tool's result is computed with the exact functions its registry
 * `run()` uses (over the audit's homepage/robots/llms), so a seeded run and a
 * manual rerun render identically.
 */
export async function seedToolRunsFromAudit(input: {
  workspaceId: string;
  siteUrl: string;
  homepage: PageSnapshot;
  robots: RobotsResult;
  llms: LlmsTxtResult;
  businessType: BusinessType;
}): Promise<void> {
  const { workspaceId, siteUrl, homepage, robots, llms, businessType } = input;

  const compute: Record<string, () => { score: number | null; data: unknown }> = {
    "crawler-access": () => {
      const r = analyzeCrawlerAccess(robots);
      return { score: r.score, data: r };
    },
    "content-signals": () => ({ score: null, data: parseContentSignals(robots.content) }),
    "llms-txt": () => {
      const r = analyzeLlmsTxt(llms);
      return { score: r.score, data: r };
    },
    "meta-audit": () => {
      const r = auditMeta(homepage);
      return { score: r.score, data: r };
    },
    citability: () => {
      const r = analyzePageCitability(homepage.html ?? "");
      return { score: r.page_score, data: r };
    },
    "technical-seo": () => {
      const r = auditTechnical(homepage, robots);
      return { score: r.score, data: r };
    },
    "schema-audit": () => {
      const r = scoreSchema(validateSchema(detectSchema(homepage).blocks));
      return { score: r.score, data: r };
    },
    "schema-generator": () => {
      const detection = detectSchema(homepage);
      const scored = scoreSchema(validateSchema(detection.blocks));
      const fixes = generateSchema({
        present: scored.present,
        sameAsAudit: scored.sameAsAudit,
        types: detection.types,
        businessType,
        snapshot: homepage,
      });
      return { score: scored.score, data: { fixes } };
    },
  };

  const rows: (typeof toolRuns.$inferInsert)[] = [];
  for (const [slug, run] of Object.entries(compute)) {
    // One broken analyzer must not cost the other tools their seed.
    try {
      const { score, data } = run();
      rows.push({ workspaceId, slug, input: { input: siteUrl }, result: data ?? null, score });
    } catch (error) {
      logError("visibility.tool_seed_failed", {
        workspaceId,
        slug,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (rows.length > 0) await getDb().insert(toolRuns).values(rows);
}
