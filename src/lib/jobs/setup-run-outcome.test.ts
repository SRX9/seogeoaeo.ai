import { describe, expect, it } from "vitest";
import { setupRunOutcome } from "./setup-run-outcome";
import type { SetupStep } from "./setup-run-types";

function steps(
  partial: Partial<Record<SetupStep["key"], SetupStep["status"]>>,
): SetupStep[] {
  const keys: SetupStep["key"][] = [
    "first_audit",
    "seed_prompts",
    "answer_check",
    "competitor_baseline",
    "topic_research",
    "quick_win_fixes",
    "first_article",
    "day0_brief",
  ];
  return keys.map((key) => ({
    key,
    status: partial[key] ?? "skipped",
  }));
}

describe("setupRunOutcome", () => {
  it("fails when every step is skipped or failed", () => {
    expect(setupRunOutcome(steps({}))).toBe("failed");
    expect(
      setupRunOutcome(
        steps({
          first_audit: "failed",
          day0_brief: "done",
          quick_win_fixes: "done",
        }),
      ),
    ).toBe("failed");
  });

  it("completes when a material step is done", () => {
    expect(setupRunOutcome(steps({ first_audit: "done" }))).toBe("completed");
    expect(setupRunOutcome(steps({ first_article: "done", topic_research: "failed" }))).toBe(
      "completed",
    );
  });
});
