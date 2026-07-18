import { describe, expect, it } from "vitest";
import {
  formatAskWeekSummary,
  resolveAskActionRequest,
  resolveAskIntent,
} from "@/lib/agent/ask-shared";

describe("Ask Claudia routing", () => {
  it("keeps grounded reads separate from reviewed mutations", () => {
    const reads = [
      ["What objective are you working toward?", "current_objective"],
      ["Why is this the current plan?", "current_plan"],
      ["What actions have you taken?", "action_history"],
    ] as const;
    for (const [message, expected] of reads) {
      expect(resolveAskActionRequest(message)).toBeNull();
      expect(resolveAskIntent(message)).toBe(expected);
    }

    const mutations = [
      ["Reorder the plan to prioritize audits", "plan_change"],
      ["Always allow publishing", "policy"],
      ["Publish this article now", "live_action"],
    ] as const;
    for (const [message, expected] of mutations) {
      expect(resolveAskActionRequest(message)).toBe(expected);
    }

    expect(resolveAskIntent("Tell me a joke")).toBeNull();

    expect(
      formatAskWeekSummary({
        weeklyUsage: { articlesWritten: 2, articlesPublished: 1 },
        visibility: { score: 72, delta: 4 },
        aiAnswers: { appeared: 3, total: 5 },
        topFindings: [{ severity: "critical", title: "Robots block the docs" }],
        latestAction: {
          actionType: "publish",
          resourceRef: "article:123",
          status: "succeeded",
          verificationStatus: "verified",
          createdAt: "2026-07-14T08:00:00.000Z",
        },
      }),
    ).toContain("2 articles written and 1 published");
  });
});
