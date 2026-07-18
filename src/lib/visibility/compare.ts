import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings, audits, platformScores } from "@/lib/db/schema/visibility";
import { SUBSCORE_LABELS } from "./display";
import type { SubScore } from "./types";

/**
 * V6.3: monthly delta / progress tracker. Compares a baseline audit to the
 * current one across every score + platform with trend symbols, tracks resolved
 * action items, and projects a 6-month trajectory. This is what proves the gain.
 * Delta logic + ▲▲/▲/──/▼/▼▼ symbols per commands-reference.md "/geo compare".
 */

export type Trend = "▲▲" | "▲" | "──" | "▼" | "▼▼";

export interface ScoreDelta {
  key: string;
  label: string;
  baseline: number | null;
  current: number | null;
  delta: number;
  trend: Trend;
}

export interface AuditSummary {
  overall: number | null;
  subScores: Record<SubScore["key"], number | null>;
  platforms: Record<string, number | null>;
  resolvedFindings: number;
  totalFindings: number;
  /** Scoring methodology version (visibility/version.ts) this audit was scored with. */
  scorerVersion: number;
  analyzerSetVersion?: string;
  completeness?: string;
}

export interface DeltaReport {
  overall: ScoreDelta;
  subScores: ScoreDelta[];
  platforms: ScoreDelta[];
  actionItems: { resolved: number; total: number };
  trajectory: { month: number; projected: number }[];
  impact: string;
  baselineOnly: boolean;
  compatible: boolean;
}

export function trendFor(delta: number): Trend {
  if (delta >= 10) return "▲▲";
  if (delta > 0) return "▲";
  if (delta === 0) return "──";
  if (delta > -10) return "▼";
  return "▼▼";
}

function delta(key: string, label: string, baseline: number | null, current: number | null): ScoreDelta {
  const d = Math.round((current ?? 0) - (baseline ?? 0));
  return { key, label, baseline, current, delta: d, trend: trendFor(d) };
}

/** Pure delta computation over two audit summaries. */
export function computeDelta(baseline: AuditSummary, current: AuditSummary): DeltaReport {
  const baselineOnly = baseline === current;
  const compatible =
    baselineOnly ||
    (baseline.scorerVersion === current.scorerVersion &&
      baseline.analyzerSetVersion === current.analyzerSetVersion &&
      (baseline.completeness ?? "complete") === "complete" &&
      (current.completeness ?? "complete") === "complete");
  // Incompatible runs are never presented as a site-performance delta. Keep the
  // report shape stable for consumers, but compare the current run to itself.
  const comparisonBaseline = compatible ? baseline : current;
  const overall = delta("overall", "Overall visibility", comparisonBaseline.overall, current.overall);

  const subScores = (Object.keys(SUBSCORE_LABELS) as SubScore["key"][]).map((key) =>
    delta(key, SUBSCORE_LABELS[key], comparisonBaseline.subScores[key] ?? null, current.subScores[key] ?? null),
  );

  const platformKeys = [...new Set([...Object.keys(comparisonBaseline.platforms), ...Object.keys(current.platforms)])];
  const platforms = platformKeys.map((p) => delta(p, p, comparisonBaseline.platforms[p] ?? null, current.platforms[p] ?? null));

  // 6-month trajectory: extend the observed monthly delta, clamped to 0-100.
  const monthly = overall.delta;
  const start = current.overall ?? 0;
  const trajectory = Array.from({ length: 6 }, (_, i) => ({
    month: i + 1,
    projected: Math.max(0, Math.min(100, Math.round(start + monthly * (i + 1)))),
  }));

  let impact =
    overall.delta > 0
      ? `Overall visibility rose ${overall.delta} points. More pages now meet the standard AI engines look for when choosing sources.`
      : overall.delta < 0
        ? `Overall visibility fell ${Math.abs(overall.delta)} points. Review recent site changes and the new findings below.`
        : "Overall visibility held steady. Work the quick wins to move it up.";

  // When the scoring methodology changed between the two runs, part of the delta
  // reflects the upgraded scorer rather than the site: say so, don't hide it.
  if (!compatible) {
    impact =
      "These runs use incompatible analyzer or scoring versions, so no performance delta was calculated. A new compatible baseline is required.";
    if (baseline.scorerVersion !== current.scorerVersion) {
      impact += " The scoring methodology was upgraded between these runs.";
    }
  }

  return {
    overall,
    subScores,
    platforms,
    actionItems: { resolved: current.resolvedFindings, total: current.totalFindings },
    trajectory,
    impact,
    baselineOnly,
    compatible,
  };
}

export async function loadAuditSummary(auditId: string): Promise<AuditSummary> {
  const db = getDb();
  const row = await db.query.audits.findFirst({ where: eq(audits.id, auditId) });
  if (!row) throw new Error(`Audit ${auditId} not found`);
  const platformRows = await db.select().from(platformScores).where(eq(platformScores.auditId, auditId));
  const findingRows = await db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId));

  return {
    overall: row.overallScore,
    subScores: {
      citability: row.citabilityScore,
      brand: row.brandScore,
      eeat: row.eeatScore,
      technical: row.technicalScore,
      schema: row.schemaScore,
      platform: row.platformScore,
    },
    platforms: Object.fromEntries(platformRows.map((p) => [p.platform, p.score])),
    resolvedFindings: findingRows.filter((f) => f.isResolved).length,
    totalFindings: findingRows.length,
    scorerVersion: row.scorerVersion,
    analyzerSetVersion: row.analyzerSetVersion,
    completeness: row.completeness,
  };
}

/** Compare two versioned audits; falls back to baseline-vs-itself when only one exists. */
export async function compareAudits(baselineId: string, currentId: string): Promise<DeltaReport> {
  if (baselineId === currentId) {
    const only = await loadAuditSummary(currentId);
    return computeDelta(only, only);
  }
  const [baseline, current] = await Promise.all([loadAuditSummary(baselineId), loadAuditSummary(currentId)]);
  return computeDelta(baseline, current);
}
