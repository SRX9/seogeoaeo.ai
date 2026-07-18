import { describe, expect, it } from "vitest";
import type { AgentState } from "@/lib/agent/types";
import {
  buildOwnerRequests,
  countOwnerRequestsFromParts,
  type OwnerRequestInput,
} from "@/lib/inbox/owner-request";

function agent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    presence: {
      id: "on_duty",
      label: "On duty",
      reason: "Claudia is ready for useful work.",
      isWorking: false,
    },
    mission: {} as AgentState["mission"],
    plan: {
      id: "plan-1",
      version: 1,
      rationale: "",
      windowStart: "2026-07-14T00:00:00.000Z",
      windowEnd: "2026-07-20T00:00:00.000Z",
    },
    now: null,
    next: [],
    waiting: null,
    recentEvents: [],
    ...overrides,
  };
}

function input(overrides: Partial<OwnerRequestInput> = {}): OwnerRequestInput {
  return {
    agent: agent(),
    approvals: [],
    articles: [],
    reviewBeforePublishing: false,
    publishingConnected: true,
    ...overrides,
  };
}

describe("owner request model", () => {
  it("keeps technical recovery and prepared fix work out of the owner queue", () => {
    const recovery = buildOwnerRequests(
      input({
        agent: agent({
          waiting: {
            id: "task-1",
            title: "Recover stalled workflow",
            blockedValue: "Lease expired",
            actionLabel: "Recover task",
            href: "/activity",
            kind: "recovery",
          },
        }),
      }),
    );
    const preparedFix = buildOwnerRequests(
      input({
        agent: agent({
          waiting: {
            id: "fix-1",
            title: "Install 3 prepared fixes",
            blockedValue: "Technical fix payload",
            actionLabel: "Review fixes",
            href: "/visibility/fixes",
            kind: "decision",
          },
        }),
      }),
    );

    expect(recovery).toEqual([]);
    expect(preparedFix).toEqual([]);
  });

  it("turns approvals into readable decisions without raw payloads or resource ids", () => {
    const requests = buildOwnerRequests(
      input({
        approvals: [
          {
            id: "approval-1",
            actionType: "grant article.update",
            beforeState: { status: "review only", internalId: "record-123" },
            afterState: { instruction: "Allow metadata improvements", capability: "article.update" },
            riskLevel: "medium",
            expectedBenefit: "Claudia can improve underperforming article metadata.",
          },
        ],
      }),
    );
    const rendered = JSON.stringify(requests);

    expect(requests[0]).toMatchObject({
      type: "permission",
      title: "Allow Claudia to update articles",
      primaryAction: { kind: "approve_change" },
      alternativeAction: { kind: "decline_change" },
    });
    expect(rendered).not.toContain("resourceRef");
    expect(rendered).not.toContain("beforeState");
    expect(rendered).not.toContain("afterState");
    expect(rendered).not.toContain("record-123");
  });

  it("asks for a publishing destination only when content is ready", () => {
    const requests = buildOwnerRequests(
      input({
        articles: [{ id: "article-1", title: "Invoice reminders", status: "draft" }],
        reviewBeforePublishing: true,
        publishingConnected: false,
      }),
    );

    expect(requests.map((request) => request.type)).toEqual([
      "connection",
      "content_review",
    ]);
    expect(requests[0]?.title).toBe("Choose where Claudia should publish");
  });

  it("keeps the cheap badge count aligned with visible request rules", () => {
    expect(
      countOwnerRequestsFromParts({
        approvalCount: 2,
        draftCount: 3,
        reviewBeforePublishing: true,
        publishingConnected: false,
        billingPaused: true,
      }),
    ).toBe(7);
  });
});
