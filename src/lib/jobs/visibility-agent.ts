import type { VisibilityCaps } from "@/lib/billing/plans";
import { AUTONOMY_CATEGORIES } from "@/lib/visibility/display";

/**
 * V8.5 — Claudia's visibility duties: monitor on the plan cadence, prepare fixes,
 * apply the categories she's authorized for (V7.2), and report the score delta.
 * This module holds the deterministic cadence + dispatch-decision logic; the run
 * wiring lives in the daily cron handler (patched into the deployed worker by
 * build-cloudflare.mjs). Autonomy is earned per category, opt-in.
 */

export type AutonomyLevel = 0 | 1 | 2; // 0 monitor · 1 propose · 2 auto-apply

/** The brand-level dial: Autopilot (FULL_AUTO) or Copilot (REVIEW). */
export type AutonomyMode = "FULL_AUTO" | "REVIEW";

/** What the standing loop does with one finding on a scheduled re-audit. */
export type DispatchAction = "apply" | "propose" | "queue";

/**
 * Fix categories whose findings typically carry `fix_capability: auto` —
 * used only to show *default* levels in the settings UI. Per-finding dispatch
 * always trusts the finding's own `fixCapability`, never this set. Derived
 * from the AUTONOMY_CATEGORIES registry so the settings panel can't drift
 * from what the standing loop actually auto-applies (crawler_access robots
 * fixes were exactly that drift before the registry existed).
 */
export const AUTO_CAPABLE_CATEGORIES: ReadonlySet<string> = new Set(
  Object.entries(AUTONOMY_CATEGORIES)
    .filter(([, { autoCapable }]) => autoCapable)
    .map(([category]) => category),
);

/**
 * The dial's per-category defaults (AP4 §4): Autopilot = auto-apply where the
 * machinery can (`fix_capability: auto`), propose everywhere else; Copilot =
 * propose everywhere. Level 0 (watch) is never a default — it's an explicit
 * per-category opt-down.
 */
export function defaultLevelFor(mode: AutonomyMode, fixCapability: string | null): AutonomyLevel {
  if (mode === "FULL_AUTO" && fixCapability === "auto") return 2;
  return 1;
}

/**
 * Decide one finding's fate. Per-category overrides (the `agent_autonomy`
 * table) beat the dial; `canAutoApply` still gates Level 2, so a Level-2
 * override on a `guided` category proposes rather than applies.
 */
export function dispatchDecision(
  finding: { category: string; fixCapability: string | null },
  mode: AutonomyMode,
  overrides: Record<string, AutonomyLevel>,
): DispatchAction {
  const level = overrides[finding.category] ?? defaultLevelFor(mode, finding.fixCapability);
  if (canAutoApply(level, finding.fixCapability)) return "apply";
  if (level >= 1) return "propose";
  return "queue";
}

export interface FindingKey {
  category: string;
  title: string;
}

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

