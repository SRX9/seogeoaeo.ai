import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brandSignals } from "@/lib/db/schema/visibility";
import { type AuditSummary, loadAuditSummary } from "./compare";
import { SUBSCORE_LABELS } from "./display";
import type { SubScore } from "./types";

/**
 * V6.4: competitor AI-visibility benchmarking. Builds a you-vs-them grid across
 * overall + every sub-score + per-platform readiness + Wikipedia entity, and
 * emits "catch-up" actions where a competitor leads. Lite mode (technical +
 * citability) works after V2.3; the full grid uses the V5 depth. Reuses the
 * V2-V5 modules via already-run audits.
 */

export interface CompetitorSummary extends AuditSummary {
  label: string;
  wikipedia: boolean;
}

export interface GridRow {
  metric: string;
  kind: "score" | "flag";
  you: number | boolean | null;
  competitors: (number | boolean | null)[];
  youLead: boolean;
}

export interface CompareGrid {
  youLabel: string;
  competitorLabels: string[];
  rows: GridRow[];
  catchUp: string[];
}

const num = (v: number | null) => (v == null ? -1 : v);

export function buildCompareGrid(you: CompetitorSummary, competitors: CompetitorSummary[]): CompareGrid {
  const rows: GridRow[] = [];
  const catchUp: string[] = [];

  const scoreRow = (metric: string, get: (s: CompetitorSummary) => number | null) => {
    const yourVal = get(you);
    const compVals = competitors.map(get);
    const best = Math.max(num(yourVal), ...compVals.map(num));
    const youLead = num(yourVal) >= best;
    rows.push({ metric, kind: "score", you: yourVal, competitors: compVals, youLead });
    // A competitor materially ahead → catch-up action.
    competitors.forEach((c, i) => {
      if (num(compVals[i]) - num(yourVal) >= 8) {
        catchUp.push(`${c.label} leads on ${metric} (${compVals[i]} vs ${yourVal ?? "Not available"}). Close the gap here first.`);
      }
    });
  };

  scoreRow("Overall visibility", (s) => s.overall);
  for (const key of Object.keys(SUBSCORE_LABELS) as SubScore["key"][]) {
    scoreRow(SUBSCORE_LABELS[key], (s) => s.subScores[key] ?? null);
  }
  const platformKeys = [
    ...new Set([you, ...competitors].flatMap((s) => Object.keys(s.platforms))),
  ];
  for (const p of platformKeys) scoreRow(p, (s) => s.platforms[p] ?? null);

  // Wikipedia entity (flag row).
  const wikiCompetitors = competitors.map((c) => c.wikipedia);
  rows.push({
    metric: "Wikipedia entity",
    kind: "flag",
    you: you.wikipedia,
    competitors: wikiCompetitors,
    youLead: you.wikipedia || wikiCompetitors.every((w) => !w),
  });
  competitors.forEach((c, i) => {
    if (wikiCompetitors[i] && !you.wikipedia) {
      catchUp.push(`${c.label} has a Wikipedia entity and you don't: pursue notability (press coverage → entry).`);
    }
  });

  return { youLabel: you.label, competitorLabels: competitors.map((c) => c.label), rows, catchUp };
}

/** Load a competitor's summary (+ Wikipedia flag) from an already-run audit. */
export async function loadCompetitorSummary(auditId: string, label: string): Promise<CompetitorSummary> {
  const summary = await loadAuditSummary(auditId);
  const db = getDb();
  const signals = await db.select().from(brandSignals).where(eq(brandSignals.auditId, auditId));
  const wikipedia = signals.some((s) => s.platform === "Wikipedia" && s.status === "present");
  return { ...summary, label, wikipedia };
}

/** Build the grid from your audit + a set of competitor audits (already run). */
export async function benchmarkCompetitors(
  yourAuditId: string,
  competitors: { auditId: string; label: string }[],
): Promise<CompareGrid> {
  const you = await loadCompetitorSummary(yourAuditId, "You");
  const comps = await Promise.all(competitors.map((c) => loadCompetitorSummary(c.auditId, c.label)));
  return buildCompareGrid(you, comps);
}
