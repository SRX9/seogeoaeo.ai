import type { SetupStep, SetupStepKey } from "./setup-run-types";

/**
 * Steps that mean Claudia actually produced value — not just "skipped for no
 * website / no credits". A run with only skips/failures is `failed` so the
 * hero shows Resume instead of a false "all set".
 */
export const MATERIAL_SETUP_STEPS: ReadonlySet<SetupStepKey> = new Set([
  "first_audit",
  "answer_check",
  "competitor_baseline",
  "topic_research",
  "first_article",
]);

/** Pure settle outcome for finalizeSetupRun. */
export function setupRunOutcome(steps: SetupStep[]): "completed" | "failed" {
  const materialDone = steps.some(
    (s) => s.status === "done" && MATERIAL_SETUP_STEPS.has(s.key),
  );
  return materialDone ? "completed" : "failed";
}
