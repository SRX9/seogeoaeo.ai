import type { SetupStep, SetupStepKey } from "./setup-run-types";

/** Steps that produce the evidence and work queue used after ignition. */
export const MATERIAL_SETUP_STEPS: ReadonlySet<SetupStepKey> = new Set([
  "first_audit",
  "answer_check",
  "topic_research",
  "first_article",
]);

/**
 * The smallest useful standing baseline is a durable topic queue plus the
 * owner-facing Day-0 brief. A successful audit alone must not settle setup.
 */
export const MINIMUM_SETUP_BASELINE: ReadonlySet<SetupStepKey> = new Set([
  "topic_research",
  "day0_brief",
]);

const CONTEXTUAL_EVIDENCE_STEPS: ReadonlySet<SetupStepKey> = new Set([
  "first_audit",
  "answer_check",
]);

function isNotApplicable(step: SetupStep): boolean {
  if (step.status !== "skipped") return false;
  if (step.key === "first_audit") {
    return step.note === "No website on the brand profile yet.";
  }
  if (step.key === "answer_check") {
    return step.note === "No prompts or engines available yet.";
  }
  return false;
}

export type SetupRunOutcome = "completed" | "completed_degraded" | "blocked" | "failed";

/**
 * Pure settle outcome for finalizeSetupRun.
 *
 * - completed: minimum baseline exists and contextual evidence either exists
 *   or is explicitly inapplicable;
 * - completed_degraded: minimum baseline exists, but evidence or settlement
 *   has a recoverable gap;
 * - blocked: an owner/precondition skip prevented the minimum baseline;
 * - failed: an execution failure prevented the minimum baseline.
 */
export function setupRunOutcome(steps: SetupStep[]): SetupRunOutcome {
  const byKey = new Map(steps.map((step) => [step.key, step]));
  const minimum = [...MINIMUM_SETUP_BASELINE].map((key) => byKey.get(key));
  const minimumComplete = minimum.every((step) => step?.status === "done" && !step.degraded);

  if (!minimumComplete) {
    return minimum.some((step) => step?.status === "skipped") ? "blocked" : "failed";
  }

  const evidenceComplete = [...CONTEXTUAL_EVIDENCE_STEPS].every((key) => {
    const step = byKey.get(key);
    return (step?.status === "done" && !step.degraded) || (step ? isNotApplicable(step) : false);
  });
  return evidenceComplete ? "completed" : "completed_degraded";
}
