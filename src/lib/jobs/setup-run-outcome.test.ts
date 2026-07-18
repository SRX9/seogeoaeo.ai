import { describe, expect, it } from "vitest";
import { setupRunOutcome } from "./setup-run-outcome";
import type { SetupStep } from "./setup-run-types";

function steps(
  partial: Partial<Record<SetupStep["key"], SetupStep["status"] | SetupStep>>,
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
  return keys.map((key) => {
    const value = partial[key];
    return typeof value === "object" && value !== null
      ? value
      : { key, status: value ?? "skipped" };
  });
}

describe("setupRunOutcome", () => {
  it("distinguishes a blocked run from a permanent failure", () => {
    expect(setupRunOutcome(steps({}))).toBe("blocked");
    expect(
      setupRunOutcome(
        steps({
          first_audit: "failed",
          day0_brief: "done",
          quick_win_fixes: "done",
        }),
      ),
    ).toBe("blocked");
    expect(
      setupRunOutcome(steps({ topic_research: "failed", day0_brief: "done" })),
    ).toBe("failed");
  });

  it("requires a useful baseline before settling and marks evidence gaps degraded", () => {
    expect(setupRunOutcome(steps({ first_audit: "done" }))).toBe("blocked");
    expect(
      setupRunOutcome(steps({ topic_research: "done", day0_brief: "done" })),
    ).toBe("completed_degraded");
    expect(
      setupRunOutcome(
        steps({
          topic_research: "done",
          day0_brief: "done",
          first_audit: {
            key: "first_audit",
            status: "skipped",
            note: "No website on the brand profile yet.",
          },
          answer_check: "done",
        }),
      ),
    ).toBe("completed");
  });
});
