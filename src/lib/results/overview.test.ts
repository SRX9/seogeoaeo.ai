import { describe, expect, it } from "vitest";
import { buildResultsOverview } from "@/lib/results/overview";

describe("buildResultsOverview", () => {
  it("turns raw discovery signals into an owner-facing outcome story", () => {
    const view = buildResultsOverview({
      now: new Date("2026-07-18T00:00:00Z"),
      summary: {
        hasAudit: true,
        latest: {
          id: "audit-1",
          overall: 72,
          band: "strong",
          aiVisibility: 40,
          businessType: "saas",
          completedAt: "2026-07-17T00:00:00Z",
          subScores: {
            citability: 70,
            brand: 68,
            eeat: 76,
            technical: 80,
            schema: 62,
            platform: 55,
          },
        },
        previousOverall: 67,
        baseline: { baseline: 60, sample: 10, scope: "industry" },
      },
      traffic: {
        connected: { gsc: true, ga4: false },
        engines: [],
        gsc: [
          ...Array.from({ length: 28 }, (_, index) => ({
            date: `2026-05-${String(index + 1).padStart(2, "0")}`,
            clicks: 5,
            impressions: 50,
            position: 12,
          })),
          ...Array.from({ length: 28 }, (_, index) => ({
            date: `2026-06-${String(index + 1).padStart(2, "0")}`,
            clicks: 10,
            impressions: 80,
            position: 9,
          })),
        ],
        aiReferrals: [],
        auditMarkers: [],
      },
      answers: {
        prompts: [],
        runs: [],
        share: [{ engine: "chatgpt", prompts: 10, appeared: 4, cited: 2, share: 40 }],
      },
      siteHealth: {
        hasData: true,
        snapshot: {
          version: 1,
          generatedAt: "2026-07-17T00:00:00Z",
          source: "agent",
          siteUrl: "https://acme.test",
          psiAvailable: false,
          scores: null,
          checks: [],
          summary: { pass: 12, warn: 2, fail: 1 },
        },
        lastAuditAt: "2026-07-17T00:00:00Z",
        refreshCooldownUntil: null,
        refreshesLeft: 10,
      },
      articles: [
        {
          id: "article-1",
          topicId: null,
          title: "A useful guide",
          slug: "useful-guide",
          metaDescription: null,
          tags: null,
          bodyMarkdown: "",
          status: "published",
          version: 1,
          shape: null,
          gateResultsJson: null,
          createdAt: "2026-07-16T00:00:00Z",
          updatedAt: "2026-07-16T00:00:00Z",
          publication: {
            provider: "wordpress",
            status: "published",
            externalUrl: "https://acme.test/useful-guide",
            publishedAt: "2026-07-16T00:00:00Z",
          },
          performance: { verdict: "winner", day: 30, position: 8 },
        },
      ],
      reports: [],
    });

    expect(view.weeklyHeadline).toBe("More people are discovering your brand.");
    expect(view.areas.find((area) => area.id === "google")?.change).toContain("up 100%");
    expect(view.areas.find((area) => area.id === "ai")?.value).toBe("40% of checks");
    expect(view.areas.find((area) => area.id === "health")?.value).toBe("3 issues");
    expect(view.discoveryHealth.value).toBe("72/100");
    expect(view.discoveryHealth.delta).toBe("Up 5 points from the previous reading");
  });
});
