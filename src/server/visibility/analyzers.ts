import type { BrandResult } from "@/lib/visibility/brand";
import { analyzePageCitability } from "@/lib/visibility/citability";
import { analyzeContent } from "@/lib/visibility/content";
import type { PlatformResult } from "@/lib/visibility/platforms";
import { detectSchema } from "@/lib/visibility/schema/detect";
import { generateSchema, type SchemaFix } from "@/lib/visibility/schema/generate";
import { scoreSchema } from "@/lib/visibility/schema/score";
import { validateSchema } from "@/lib/visibility/schema/validate";
import { auditTechnical } from "@/lib/visibility/technical";
import type {
  AnalyzerResult,
  BusinessType,
  Finding,
  LlmsTxtResult,
  PageSnapshot,
  RobotsResult,
  SubScore,
} from "@/lib/visibility/types";

/**
 * V0.3 — analyzer registry. Mirrors the 5 parallel subagents of the
 * inspiration skill; the audit Workflow `Promise.all`s over this list. Each is
 * dual-mode: the same function runs inside the Workflow, a Toolbox route, or the
 * agent. Later phases replace the remaining stubs with real scorers.
 */

export interface AnalyzerInput {
  homepage: PageSnapshot;
  pages: PageSnapshot[];
  robots: RobotsResult;
  llms: LlmsTxtResult;
  businessType: BusinessType;
  /** Off-site signals (V5.1/V5.2), computed once in run-audit and shared. */
  brand: BrandResult;
  platforms: PlatformResult;
}

export type Analyzer = (input: AnalyzerInput) => Promise<AnalyzerResult>;

function stub(key: SubScore["key"]): Analyzer {
  return async () => ({ subScore: { key, score: null }, findings: [] });
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const WEAK_BLOCK = 60;

/** V2.1 — citability sub-score: average of per-page top-5 block scores. */
const citabilityAnalyzer: Analyzer = async ({ homepage, pages }) => {
  const analyses = [homepage, ...pages].map((p) => analyzePageCitability(p.html));
  const withBlocks = analyses.filter((a) => a.total_blocks_analyzed > 0);
  const score = withBlocks.length
    ? round1(withBlocks.reduce((s, a) => s + a.page_score, 0) / withBlocks.length)
    : 0;

  // Surface the weakest homepage blocks as fixable (LLM-rewrite) findings.
  const findings: Finding[] = [];
  for (const block of analyses[0]?.bottom_5 ?? []) {
    if (block.total_score >= WEAK_BLOCK) continue;
    findings.push({
      pillar: "aeo",
      category: "citability",
      severity: block.total_score < 35 ? "high" : "medium",
      title: `Low-citability section: "${block.heading ?? "Introduction"}"`,
      recommendation:
        "Lead with a direct answer, add a specific statistic or named source, and keep it " +
        "self-contained (134–167 words).",
      fix_capability: "artifact",
      fix_payload: {
        kind: "citability_rewrite",
        heading: block.heading,
        current_score: block.total_score,
        preview: block.preview,
      },
    });
  }
  return { subScore: { key: "citability", score }, findings: findings.slice(0, 5) };
};

/** V2.2 — technical sub-score (SEO owner of meta + crawler findings too). */
const technicalAnalyzer: Analyzer = async ({ homepage, robots }) => {
  const result = auditTechnical(homepage, robots);
  return { subScore: { key: "technical", score: result.score }, findings: result.findings };
};

/** V3.x — schema sub-score: detect → validate → score → generate fixes. */
const schemaAnalyzer: Analyzer = async ({ homepage, businessType }) => {
  const detection = detectSchema(homepage);
  const scored = scoreSchema(validateSchema(detection.blocks));
  const fixes = generateSchema({
    present: scored.present,
    sameAsAudit: scored.sameAsAudit,
    types: detection.types,
    businessType,
    snapshot: homepage,
  });

  // A schema-gap finding maps to its generated template (Person/speakable are
  // covered by the Article template; a local Organization gap by LocalBusiness).
  const fixFor = (gap: string): SchemaFix | undefined =>
    fixes.find((f) => f.schema === gap) ??
    (gap === "Organization"
      ? fixes.find((f) => f.schema === "LocalBusiness")
      : gap === "Person" || gap === "speakable"
        ? fixes.find((f) => f.schema === "Article")
        : undefined);

  const used = new Set<SchemaFix>();
  const findings: Finding[] = scored.findings.map((f) => {
    const payload = f.fix_payload as { kind?: string; schema?: string } | undefined;
    if (payload?.kind !== "schema_gap" || !payload.schema) return f;
    const fix = fixFor(payload.schema);
    if (!fix) return { ...f, fix_capability: "guided", fix_payload: undefined };
    used.add(fix);
    return { ...f, fix_payload: { kind: "schema", schema: fix.schema, jsonLd: fix.jsonLd } };
  });

  // Surface any generated template that no gap finding claimed.
  for (const fix of fixes) {
    if (used.has(fix)) continue;
    findings.push({
      pillar: "geo",
      category: "schema",
      severity: "low",
      title: `Add ${fix.schema} schema`,
      recommendation: `Ready-to-paste ${fix.schema} JSON-LD generated for your site.`,
      fix_capability: "artifact",
      fix_payload: { kind: "schema", schema: fix.schema, jsonLd: fix.jsonLd },
    });
  }
  if (detection.jsInjectionRisk) {
    findings.push({
      pillar: "geo",
      category: "schema",
      severity: "high",
      title: "Schema may be JavaScript-injected",
      recommendation:
        "Server-render your JSON-LD — AI crawlers don't run JS and Google delays JS-injected schema.",
      fix_capability: "guided",
    });
  }

  return { subScore: { key: "schema", score: scored.score }, findings };
};

/** V4.x — content & E-E-A-T sub-score across homepage + discovered pages. */
const eeatAnalyzer: Analyzer = async ({ homepage, pages }) => {
  const siteUrls = [homepage.url, ...pages.map((p) => p.url)];
  const { subScore, findings } = await analyzeContent(homepage, siteUrls);
  return { subScore, findings };
};

/** V5.1 — brand authority sub-score (computed in run-audit, shared here). */
const brandAnalyzer: Analyzer = async ({ brand }) => ({
  subScore: { key: "brand", score: brand.score },
  findings: brand.findings,
});

/** V5.2 — platform readiness sub-score (average of the 5 engines). */
const platformAnalyzer: Analyzer = async ({ platforms }) => ({
  subScore: { key: "platform", score: platforms.average },
  findings: platforms.findings,
});

export const analyzers: Analyzer[] = [
  citabilityAnalyzer, // V2.1
  brandAnalyzer, // V5.1
  eeatAnalyzer, // V4.x
  technicalAnalyzer, // V2.2
  schemaAnalyzer, // V3.x
  platformAnalyzer, // V5.2
];
