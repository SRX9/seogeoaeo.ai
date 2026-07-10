/**
 * Setup Run step list (shared types for pure outcome + executor).
 * Labels live with the executor so product copy stays next to runners.
 */

export const SETUP_STEP_KEYS = [
  "first_audit",
  "seed_prompts",
  "answer_check",
  "competitor_baseline",
  "topic_research",
  "quick_win_fixes",
  "first_article",
  "day0_brief",
] as const;

export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];
export type SetupStepStatus = "pending" | "running" | "done" | "skipped" | "failed";
export type SetupStep = { key: SetupStepKey; status: SetupStepStatus; note?: string };
