import { describe, expect, it } from "vitest";
import type { AgentState } from "@/lib/agent/types";
import type { AutomationStats, VisibilityFinding } from "@/lib/api/queries";
import { buildClaudiaHomeView } from "@/lib/dashboard/claudia-home-view";

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

function automation(overrides: Partial<AutomationStats> = {}): AutomationStats {
  return {
    enabled: true,
    autoPublish: false,
    schedule: "Daily",
    nextRunAt: "2026-07-18T09:00:00.000Z",
    agentState: "active",
    dailyCap: 2,
    writtenToday: 0,
    pendingTopics: 1,
    nextTopic: {
      id: "topic-1",
      title: "How to choose an invoice reminder workflow",
      angle: "A practical buyer guide",
      rationale: "High-intent buyers are comparing approaches, but competitors answer only part of the question.",
      answerFit: "comparison",
      intentTier: "high",
      thesis: "A complete answer can win qualified demand.",
    },
    workingSince: "2026-07-01T00:00:00.000Z",
    totalRuns: 3,
    articlesWritten: 2,
    articlesPublished: 1,
    thisWeek: { articlesWritten: 2, articlesPublished: 1 },
    lastRun: null,
    ...overrides,
  };
}

const finding: VisibilityFinding = {
  id: "finding-1",
  pillar: "geo",
  category: "citability",
  severity: "high",
  title: "Add sources to the buyer guide",
  recommendation: "Cited evidence helps search and AI systems trust and reuse the answer.",
  fixCapability: "guided",
  fixPayload: null,
};

describe("simplified Claudia home view", () => {
  it("selects one content opportunity and one highest-priority website fix", () => {
    const view = buildClaudiaHomeView({
      agent: agent(),
      ownerRequests: [],
      automation: automation(),
      findings: [finding],
    });

    expect(view.headline).toContain("answer you have not published");
    expect(view.contentOpportunity).toMatchObject({
      id: "topic-1",
      format: "Comparison guide",
      audience: "People close to choosing a solution",
    });
    expect(view.checklistItem).toMatchObject({
      id: "finding-1",
      href: "/checklist?item=finding-1",
    });
  });

  it("keeps technical recovery details out of customer-facing copy", () => {
    const view = buildClaudiaHomeView({
      agent: agent({
        presence: {
          id: "needs_attention",
          label: "Needs attention",
          reason: "A task heartbeat stopped.",
          isWorking: false,
        },
        waiting: {
          id: "task-1",
          title: "Task heartbeat stopped",
          blockedValue: "lease expired",
          actionLabel: "Recover task",
          href: "/work",
          kind: "recovery",
        },
      }),
      ownerRequests: [],
      automation: automation(),
      findings: [finding],
    });

    expect(`${view.headline} ${view.explanation}`).not.toMatch(/heartbeat|lease/i);
  });
});
