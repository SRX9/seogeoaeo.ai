import type { EngineShare } from "@/lib/visibility/answers";
import type { DeltaReport } from "@/lib/visibility/compare";
import type { VisibilityCaps } from "@/lib/billing/plans";

/**
 * V8.5 — Claudia's visibility duties: monitor on the plan cadence, prepare fixes,
 * apply the categories she's authorized for (V7.2), and report the score delta.
 * This module holds the deterministic cadence + digest logic; the run wiring
 * lives in the daily cron handler (patched into the deployed worker by
 * build-cloudflare.mjs). Autonomy is earned per category, opt-in.
 */

export type AutonomyLevel = 0 | 1 | 2; // 0 monitor · 1 propose · 2 auto-apply

const CADENCE_DAYS: Record<VisibilityCaps["monitoringCadence"], number> = {
  none: Number.POSITIVE_INFINITY,
  monthly: 30,
  weekly: 7,
};

/** Is a site due for a scheduled re-audit given the plan cadence? */
export function dueForReaudit(
  lastAuditAt: Date | null,
  cadence: VisibilityCaps["monitoringCadence"],
  now: Date = new Date(),
): boolean {
  if (cadence === "none") return false;
  if (!lastAuditAt) return true;
  const ageDays = (now.getTime() - lastAuditAt.getTime()) / 86_400_000;
  return ageDays >= CADENCE_DAYS[cadence];
}

/** Only `auto`-capable categories may ever reach Level 2 (auto-apply). */
export function canAutoApply(level: AutonomyLevel, fixCapability: string | null): boolean {
  return level === 2 && fixCapability === "auto";
}

export interface DigestInput {
  siteUrl: string;
  delta: DeltaReport;
  answerShare?: EngineShare[];
  fixesApplied?: number;
  awaitingApproval?: number;
  clicksDeltaPct?: number | null;
}

/**
 * The weekly digest, ordered by the proof stack: score + delta, then answer
 * share, then traffic (when connected). Claudia's voice.
 */
export function buildDigest(input: DigestInput): string {
  const { delta, answerShare, fixesApplied = 0, awaitingApproval = 0, clicksDeltaPct } = input;
  const lines: string[] = [];
  const o = delta.overall;

  lines.push(
    o.delta === 0
      ? `Your visibility score held at ${o.current ?? "—"}.`
      : `Your visibility score moved ${o.baseline ?? "—"} → ${o.current ?? "—"} (${o.delta > 0 ? "+" : ""}${o.delta}).`,
  );

  if (answerShare && answerShare.length > 0) {
    const best = [...answerShare].sort((a, b) => b.appeared - a.appeared)[0];
    lines.push(`You appeared in ${best.appeared} of ${best.prompts} tracked ${best.engine} answers.`);
  }
  if (clicksDeltaPct != null) {
    lines.push(`Clicks ${clicksDeltaPct >= 0 ? "+" : ""}${clicksDeltaPct}% since your baseline audit.`);
  }
  if (fixesApplied > 0) lines.push(`Claudia fixed ${fixesApplied} issue${fixesApplied === 1 ? "" : "s"} for you this cycle.`);
  if (awaitingApproval > 0) lines.push(`${awaitingApproval} fix${awaitingApproval === 1 ? "" : "es"} are ready for your one-click approval.`);

  return lines.join(" ");
}
