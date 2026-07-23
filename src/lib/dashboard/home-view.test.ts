import { describe, expect, it } from "vitest";
import type { AgentState } from "@/lib/agent/types";
import type { Article, AutomationStats } from "@/lib/api/queries";
import { buildClaudiaHomeView } from "@/lib/dashboard/home-view";
import { buildOwnerRequests } from "@/lib/inbox/owner-request";

type HomeInput = Parameters<typeof buildClaudiaHomeView>[0];

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
    autoPublish: true,
    schedule: "Daily",
    nextRunAt: "2026-07-18T09:00:00.000Z",
    agentState: "active",
    dailyCap: 2,
    writtenToday: 0,
    pendingTopics: 0,
    nextTopic: null,
    workingSince: "2026-07-01T00:00:00.000Z",
    totalRuns: 3,
    articlesWritten: 2,
    articlesPublished: 1,
    thisWeek: { articlesWritten: 2, articlesPublished: 1 },
    lastRun: null,
    ...overrides,
  };
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "article-1",
    topicId: "topic-1",
    title: "A useful guide",
    slug: "a-useful-guide",
    metaDescription: null,
    tags: null,
    bodyMarkdown: "",
    status: "published",
    version: 1,
    shape: null,
    gateResultsJson: null,
    updatedAt: "2026-07-17T09:00:00.000Z",
    createdAt: "2026-07-16T09:00:00.000Z",
    performance: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<HomeInput> = {}): HomeInput {
  return {
    agent: agent(),
    ownerRequests: [],
    articles: [],
    automation: automation(),
    answers: { prompts: [], runs: [], share: [] },
    summary: {
      hasAudit: false,
      latest: null,
      previousOverall: null,
      baseline: { baseline: null, sample: 0, scope: "dashboard" },
    },
    traffic: {
      connected: { gsc: false, ga4: false },
      engines: [],
      gsc: [],
      aiReferrals: [],
      auditMarkers: [],
    },
    ...overrides,
  };
}

describe("Claudia home view", () => {
  it("turns operational data into a short outcome briefing", () => {
    const gsc = Array.from({ length: 56 }, (_, index) => ({
      date: `2026-${index < 28 ? "05" : "06"}-${String((index % 28) + 1).padStart(2, "0")}`,
      clicks: index < 28 ? 1 : 2,
      impressions: 10,
      position: null,
    }));
    const view = buildClaudiaHomeView(
      baseInput({
        articles: [article()],
        answers: {
          prompts: [],
          runs: [],
          share: [{ engine: "openai", prompts: 10, appeared: 3, cited: 2, share: 30 }],
        },
        summary: {
          hasAudit: true,
          latest: {
            id: "audit-1",
            overall: 80,
            band: "Good",
            aiVisibility: 70,
            businessType: "saas",
            completedAt: "2026-07-17T00:00:00.000Z",
            subScores: {
              citability: 80,
              brand: 80,
              eeat: 80,
              technical: 80,
              schema: 80,
              platform: 80,
            },
          },
          previousOverall: 75,
          baseline: { baseline: null, sample: 0, scope: "dashboard" },
        },
        traffic: {
          connected: { gsc: true, ga4: false },
          engines: [],
          gsc,
          aiReferrals: [],
          auditMarkers: [],
        },
      }),
    );

    expect(view.status).toBe("on_track");
    expect(view.weeklySummary).toContain("2 articles");
    expect(view.recentContent[0]).toMatchObject({
      title: "A useful guide",
      status: "Published",
    });
    expect(view.resultHighlights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "google", value: "56 clicks", tone: "positive" }),
        expect.objectContaining({ id: "ai", value: "30%" }),
        expect.objectContaining({ id: "health", value: "80/100", tone: "positive" }),
      ]),
    );
  });

  it("keeps recovery machinery out of the customer experience", () => {
    const view = buildClaudiaHomeView(
      baseInput({
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
      }),
    );

    expect(view.status).toBe("technical_issue");
    expect(view.ownerRequest).toBeNull();
    expect(view.needsInputCount).toBe(0);
    expect(`${view.headline} ${view.explanation}`).not.toMatch(/recover|heartbeat|lease/i);
  });

  it("surfaces one plain-language review request when publishing needs approval", () => {
    const operatingState = agent();
    const draft = article({ status: "draft", title: "Invoice reminder guide" });
    const ownerRequests = buildOwnerRequests({
      agent: operatingState,
      approvals: [],
      articles: [draft],
      autonomyMode: "REVIEW",
      publishingConnected: true,
    });
    const view = buildClaudiaHomeView(
      baseInput({
        agent: operatingState,
        automation: automation({ autoPublish: false }),
        articles: [draft],
        ownerRequests,
      }),
    );

    expect(view.status).toBe("waiting_for_user");
    expect(view.needsInputCount).toBe(1);
    expect(view.ownerRequest).toMatchObject({
      title: "Review “Invoice reminder guide”",
      action: { label: "Review decision" },
    });
  });
});
