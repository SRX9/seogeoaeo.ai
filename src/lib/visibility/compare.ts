import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditFindings, audits, platformScores } from "@/lib/db/schema/visibility";
import { SUBSCORE_LABELS } from "./display";
import type { SubScore } from "./types";

/**
 * V6.3 — monthly delta / progress tracker. Compares a baseline audit to the
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
}

export interface DeltaReport {
  overall: ScoreDelta;
  subScores: ScoreDelta[];
  platforms: ScoreDelta[];
  actionItems: { resolved: number; total: number };
  trajectory: { month: number; projected: number }[];
  impact: string;
  baselineOnly: boolean;
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
  const overall = delta("overall", "Overall visibility", baseline.overall, current.overall);

  const subScores = (Object.keys(SUBSCORE_LABELS) as SubScore["key"][]).map((key) =>
    delta(key, SUBSCORE_LABELS[key], baseline.subScores[key] ?? null, current.subScores[key] ?? null),
  );

  const platformKeys = [...new Set([...Object.keys(baseline.platforms), ...Object.keys(current.platforms)])];
  const platforms = platformKeys.map((p) => delta(p, p, baseline.platforms[p] ?? null, current.platforms[p] ?? null));

  // 6-month trajectory: extend the observed monthly delta, clamped to 0–100.
  const monthly = overall.delta;
  const start = current.overall ?? 0;
  const trajectory = Array.from({ length: 6 }, (_, i) => ({
    month: i + 1,
    projected: Math.max(0, Math.min(100, Math.round(start + monthly * (i + 1)))),
  }));

  const impact =
    overall.delta > 0
      ? `Overall visibility rose ${overall.delta} points — more of your pages now clear the bar where AI engines cite sources. Keep resolving findings to compound the gain.`
      : overall.delta < 0
        ? `Overall visibility fell ${Math.abs(overall.delta)} points — review recent site changes and the new findings below.`
        : "Overall visibility held steady. Work the quick wins to move it up.";

  return {
    overall,
    subScores,
    platforms,
    actionItems: { resolved: current.resolvedFindings, total: current.totalFindings },
    trajectory,
    impact,
    baselineOnly,
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
