import { describe, expect, it } from "vitest";
import {
  articleReviewNeededEmail,
  dailyStandupEmail,
  setupRunCompletedEmail,
} from "@/lib/email/templates";

describe("Claudia communication emails", () => {
  it("renders the setup-complete milestone with a dashboard action", () => {
    const email = setupRunCompletedEmail({
      brandName: "Acme",
      summary: "I found three useful opportunities.",
      dashboardUrl: "https://example.com/dashboard",
    });

    expect(email.subject).toContain("finished setting up Acme");
    expect(email.text).toContain("three useful opportunities");
    expect(email.html).toContain("https://example.com/dashboard");
  });

  it("explains why an Auto-mode article needs review", () => {
    const email = articleReviewNeededEmail({
      brandName: "Acme",
      articleTitle: "A safer invoice workflow",
      articleUrl: "https://example.com/articles/1",
      reason: "quality_hold",
    });

    expect(email.subject).toContain("A safer invoice workflow");
    expect(email.text).toContain("needs your judgment");
    expect(email.html).toContain("https://example.com/articles/1");
  });

  it("summarizes the daily run without inventing work", () => {
    const email = dailyStandupEmail({
      brandName: "Acme",
      runDate: "2026-07-23",
      articlesWritten: 2,
      topicsResearched: 4,
      failures: 1,
      status: "completed_degraded",
      dashboardUrl: "https://example.com/dashboard",
    });

    expect(email.text).toContain("Wrote 2 articles.");
    expect(email.text).toContain("Researched 4 new topics.");
    expect(email.text).toContain("Held 1 item for recovery.");
  });
});
