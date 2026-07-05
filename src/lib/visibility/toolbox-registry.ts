import { analyzePageCitability } from "./citability";
import { analyzeCrawlerAccess, parseContentSignals } from "./crawler-access";
import { fetchPage } from "./fetch-page";
import { validateLlmsTxt } from "./llms";
import { auditMeta } from "./meta-audit";
import { detectSchema } from "./schema/detect";
import { generateSchema } from "./schema/generate";
import { scoreSchema } from "./schema/score";
import { validateSchema } from "./schema/validate";
import { fetchRobots } from "./robots";
import { auditTechnical } from "./technical";
import { TOOLBOX_META, type ToolboxMeta } from "./toolbox-meta";
import type { Finding } from "./types";

/**
 * V8.3 — the Toolbox registry: every analyzer as a standalone, per-run-priced
 * tool. Pairs the client-safe metadata (`toolbox-meta.ts`) with each tool's
 * `run()` — the analyzer's dual-mode entry-point (engine contract #2), identical
 * to what the audit calls — so findings land in the same fix queue.
 */

export interface ToolResult {
  score: number | null;
  findings: Finding[];
  data: unknown;
}

export type ToolboxEntry = ToolboxMeta & { run: (input: string) => Promise<ToolResult> };

const toUrl = (input: string) => (/^https?:\/\//i.test(input) ? input : `https://${input}`);

const RUNNERS: Record<string, (input: string) => Promise<ToolResult>> = {
  "crawler-access": async (input) => {
    const r = analyzeCrawlerAccess(await fetchRobots(toUrl(input)));
    return { score: r.score, findings: r.findings, data: r };
  },
  "content-signals": async (input) => {
    const robots = await fetchRobots(toUrl(input));
    return { score: null, findings: [], data: parseContentSignals(robots.content) };
  },
  "llms-txt": async (input) => {
    const r = await validateLlmsTxt(toUrl(input));
    return { score: r.score, findings: r.findings, data: r };
  },
  "meta-audit": async (input) => {
    const r = auditMeta(await fetchPage(toUrl(input)));
    return { score: r.score, findings: r.findings, data: r };
  },
  citability: async (input) => {
    const html = input.includes("<") ? input : `<html><body><p>${input}</p></body></html>`;
    const r = analyzePageCitability(html);
    return { score: r.page_score, findings: [], data: r };
  },
  "technical-seo": async (input) => {
    const url = toUrl(input);
    const [page, robots] = await Promise.all([fetchPage(url), fetchRobots(url)]);
    const r = auditTechnical(page, robots);
    return { score: r.score, findings: r.findings, data: r };
  },
  "schema-audit": async (input) => {
    const page = await fetchPage(toUrl(input));
    const r = scoreSchema(validateSchema(detectSchema(page).blocks));
    return { score: r.score, findings: r.findings, data: r };
  },
  "schema-generator": async (input) => {
    const page = await fetchPage(toUrl(input));
    const detection = detectSchema(page);
    const scored = scoreSchema(validateSchema(detection.blocks));
    const fixes = generateSchema({
      present: scored.present,
      sameAsAudit: scored.sameAsAudit,
      types: detection.types,
      businessType: "other",
      snapshot: page,
    });
    return { score: scored.score, findings: scored.findings, data: { fixes } };
  },
};

export const TOOLBOX: ToolboxEntry[] = TOOLBOX_META.map((meta) => ({ ...meta, run: RUNNERS[meta.slug] }));

export function getTool(slug: string): ToolboxEntry | undefined {
  return TOOLBOX.find((t) => t.slug === slug);
}
