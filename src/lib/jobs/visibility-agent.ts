import type { VisibilityCaps } from "@/lib/billing/plans";
import { canLiveApplyCapability } from "@/lib/connectors/certification";
import { AUTONOMY_CATEGORIES } from "@/lib/visibility/display";

/**
 * V8.5: Claudia's visibility duties: monitor on the plan cadence, prepare fixes,
 * live-apply when a channel exists (V7.2), and report the score delta.
 * Pure cadence + dispatch decision logic; orchestration lives in
 * `fix-policy.dispatchOpenFindings` + visibility cron / AuditRunWorkflow.
 *
 * Visibility fixes stay at Prepare until their exact connector capability is
 * passed in with a valid certification gate. Never mark `auto_applied` merely
 * because some other connector capability has been certified.
 */

export type AutonomyLevel = 0 | 1 | 2; // 0 watch · 1 prepare · 2 live-apply (when available)

/** The brand-level dial: Autopilot (FULL_AUTO) or Copilot (REVIEW). */
export type AutonomyMode = "FULL_AUTO" | "REVIEW";

/** What the standing loop does with one finding on a scheduled re-audit. */
export type DispatchAction = "apply" | "propose" | "queue";

/**
 * Fix categories whose findings typically carry `fix_capability: auto`.
 * used only for *default* levels in settings. Per-finding dispatch trusts the
 * finding's own `fixCapability`, never this set.
 */
export const AUTO_CAPABLE_CATEGORIES: ReadonlySet<string> = new Set(
  Object.entries(AUTONOMY_CATEGORIES)
    .filter(([, { autoCapable }]) => autoCapable)
    .map(([category]) => category),
);

/**
 * Whether Claudia can push this exact capability onto the live site. Callers
 * without a matching certification record fail closed.
 */
export function canLiveApply(
  fixCapability: string | null,
  gate?: Parameters<typeof canLiveApplyCapability>[0],
): boolean {
  return Boolean(
    fixCapability &&
      gate &&
      gate.capability === fixCapability &&
      canLiveApplyCapability(gate),
  );
}

/** A prepared fix must contain an installable payload, not only generic guidance. */
export function canPrepareFix(fixCapability: string | null | undefined): boolean {
  return fixCapability === "auto" || fixCapability === "artifact";
}

/**
 * Dial defaults: Autopilot aims for live-apply (2) only when a channel exists
 * for that capability; otherwise both modes default to Prepare (1). Level 0
 * is never a default: opt-down only.
 */
export function defaultLevelFor(mode: AutonomyMode, fixCapability: string | null): AutonomyLevel {
  if (mode === "FULL_AUTO" && fixCapability === "auto" && canLiveApply(fixCapability)) {
    return 2;
  }
  return 1;
}

/**
 * Decide one finding's fate. Per-category overrides beat the dial; live-apply
 * only when Level 2 + auto-capable + {@link canLiveApply}. Otherwise Level ≥1
 * proposes a ready artifact for the owner.
 */
export function dispatchDecision(
  finding: { category: string; fixCapability: string | null },
  mode: AutonomyMode,
  overrides: Record<string, AutonomyLevel>,
): DispatchAction {
  const level = overrides[finding.category] ?? defaultLevelFor(mode, finding.fixCapability);
  if (canAutoApply(level, finding.fixCapability)) return "apply";
  if (level >= 1 && canPrepareFix(finding.fixCapability)) return "propose";
  return "queue";
}

export interface FindingKey {
  category: string;
  title: string;
}

export const MONITORING_CADENCE_DAYS: Record<
  VisibilityCaps["monitoringCadence"],
  number
> = {
  none: Number.POSITIVE_INFINITY,
  monthly: 30,
  weekly: 7,
};

/** Longest finite interval after which a scheduled visibility observation is stale. */
export const MAX_FINITE_MONITORING_CADENCE_DAYS = Math.max(
  ...Object.values(MONITORING_CADENCE_DAYS).filter(Number.isFinite),
);

/** Is a site due for a scheduled re-audit given the plan cadence? */
export function dueForReaudit(
  lastAuditAt: Date | null,
  cadence: VisibilityCaps["monitoringCadence"],
  now: Date = new Date(),
): boolean {
  if (cadence === "none") return false;
  if (!lastAuditAt) return true;
  const ageDays = (now.getTime() - lastAuditAt.getTime()) / 86_400_000;
  return ageDays >= MONITORING_CADENCE_DAYS[cadence];
}

/**
 * Level 2 + auto-capable + a real live-apply channel. Without a channel,
 * Autopilot still prepares: it never pretends the site changed.
 */
export function canAutoApply(level: AutonomyLevel, fixCapability: string | null): boolean {
  return level === 2 && fixCapability === "auto" && canLiveApply(fixCapability);
}
