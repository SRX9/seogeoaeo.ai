import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings, audits, brandSignals, platformScores } from "@/lib/db/schema/visibility";
import { buildActionPlan, type ActionTheme } from "./action-plan";
import { PILLAR_LABELS, scoreBand, SUBSCORE_LABELS } from "./display";
import type { Finding, Pillar, Severity, SubScore } from "./types";

/**
 * V6.1 — client report generator. Aggregates stored audit data into one
 * business-language model (in-app view + Markdown export) with the 12 sections
 * from commands-reference.md "/geo report". Owner language throughout — the
 * SEO/AEO/GEO taxonomy never surfaces (labels come from display.ts).
 */

export interface ReportModel {
  site: string;
  businessType: string | null;
  generatedAt: string;
  overall: number | null;
  band: string;
  aiVisibility: number | null;
  subScores: { key: SubScore["key"]; label: string; score: number | null }[];
  platforms: { platform: string; score: number | null }[];
  brand: { platform: string; status: string; score: number | null }[];
  findingsByPillar: Record<Pillar, Finding[]>;
  severityCounts: Record<Severity, number>;
  quickWins: Finding[];
  themes: ActionTheme[];
  impact: string;
}

const PILLARS: Pillar[] = ["seo", "aeo", "geo"];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

export async function buildReport(auditId: string): Promise<ReportModel> {
  const db = getDb();
  const audit = await db.query.audits.findFirst({ where: eq(audits.id, auditId) });
  if (!audit) throw new Error(`Audit ${auditId} not found`);
  const findingRows = await db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId));
  const platformRows = await db.select().from(platformScores).where(eq(platformScores.auditId, auditId));
  const brandRows = await db.select().from(brandSignals).where(eq(brandSignals.auditId, auditId));

  const findings: Finding[] = findingRows.map((f) => ({
    pillar: f.pillar as Pillar,
    category: f.category,
    severity: f.severity as Severity,
    title: f.title,
    recommendation: f.recommendation,
    fix_capability: (f.fixCapability as Finding["fix_capability"]) ?? undefined,
    fix_payload: f.fixPayload ?? undefined,
  }));

  const plan = buildActionPlan(findings);
  const overall = audit.overallScore;

  return {
    site: audit.siteUrl,
    businessType: audit.businessType,
    generatedAt: (audit.completedAt ?? audit.createdAt).toISOString(),
    overall,
    band: overall != null ? scoreBand(overall) : "Not scored",
    aiVisibility: audit.aiVisibilityScore,
    subScores: (Object.keys(SUBSCORE_LABELS) as SubScore["key"][]).map((key) => ({
      key,
      label: SUBSCORE_LABELS[key],
      score: audit[`${key}Score` as const] as number | null,
    })),
    platforms: platformRows.map((p) => ({ platform: p.platform, score: p.score })),
    brand: brandRows.map((b) => ({ platform: b.platform, status: b.status, score: b.score })),
    findingsByPillar: Object.fromEntries(
      PILLARS.map((p) => [p, findings.filter((f) => f.pillar === p)]),
    ) as Record<Pillar, Finding[]>,
    severityCounts: Object.fromEntries(
      SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]),
    ) as Record<Severity, number>,
    quickWins: plan.quickWins,
    themes: plan.themes,
    impact:
      overall == null
        ? "Run a full audit to score your visibility."
        : overall >= 75
          ? "Your site is well-positioned to be found and cited. Hold the line and close the remaining gaps."
          : overall >= 60
            ? "Solid foundation with clear upside — the quick wins below should move the needle within weeks."
            : "Meaningful gaps are costing you visibility. The prioritized plan targets the highest-impact fixes first.",
  };
}

const line = (score: number | null) => (score == null ? "—" : `${Math.round(score)}/100`);

/** Deterministic Markdown export — the 12-section client report. */
export function toMarkdown(m: ReportModel): string {
  const out: string[] = [];
  out.push(`# Visibility report — ${m.site}`, "");
  out.push(`_Generated ${m.generatedAt.slice(0, 10)}${m.businessType ? ` · ${m.businessType}` : ""}_`, "");

  out.push("## 1. Executive summary", "");
  out.push(`**Overall visibility: ${line(m.overall)} (${m.band})**`, "", m.impact, "");

  out.push("## 2. Score dashboard", "");
  for (const s of m.subScores) out.push(`- **${s.label}:** ${line(s.score)}`);
  out.push("");

  out.push("## 3. AI-assistant readiness", "");
  out.push(`Combined AI-visibility score: **${line(m.aiVisibility)}**.`, "");
  for (const p of m.platforms) out.push(`- ${p.platform}: ${line(p.score)}`);
  out.push("");

  out.push("## 4. Crawler access", "");
  out.push(section(m.findingsByPillar.geo.filter((f) => f.category === "crawler_access")), "");

  out.push("## 5. Brand authority", "");
  for (const b of m.brand) out.push(`- ${b.platform}: ${b.status} (${line(b.score)})`);
  out.push("");

  out.push("## 6. Quotable answers (citability)", "");
  out.push(section(m.findingsByPillar.aeo.filter((f) => f.category === "citability")), "");

  out.push("## 7. Site health (technical)", "");
  out.push(section(m.findingsByPillar.seo.filter((f) => ["ssr", "security", "core_web_vitals", "url_structure"].includes(f.category))), "");

  out.push("## 8. Structured data", "");
  out.push(section(m.findingsByPillar.geo.filter((f) => f.category === "schema")), "");

  out.push("## 9. AI site guide (llms.txt)", "");
  out.push(section(m.findingsByPillar.geo.filter((f) => f.category === "llms_txt")), "");

  out.push("## 10. Prioritized action plan", "");
  out.push("### Quick wins", "");
  for (const f of m.quickWins) out.push(`- **${f.title}** — ${f.recommendation}`);
  if (m.quickWins.length === 0) out.push("- None outstanding — nice.");
  out.push("");
  for (const theme of m.themes) {
    out.push(`### Week ${theme.week}: ${theme.title}`, "");
    for (const f of theme.findings) out.push(`- **${f.title}** — ${f.recommendation}`);
    out.push("");
  }

  out.push("## 11. Competitor comparison", "");
  out.push("_Run a competitor benchmark to populate this section._", "");

  out.push("## 12. Glossary", "");
  for (const [pillar, label] of Object.entries(PILLAR_LABELS)) out.push(`- **${label}** — ${pillar.toUpperCase()} signals.`);
  out.push("");

  return out.join("\n");
}

function section(findings: Finding[]): string {
  if (findings.length === 0) return "No issues found.";
  return findings.map((f) => `- **${f.title}** (${f.severity}) — ${f.recommendation}`).join("\n");
}
