import { describe, expect, it } from "vitest";
import {
  articleReviewNeededEmail,
  dailyStandupEmail,
  outOfCreditsEmail,
  setupRunCompletedEmail,
  setupRunStalledEmail,
  visibilityAlertEmail,
  weeklyReportEmail,
  type EmailContent,
} from "@/lib/email/templates";

function expectPlainClaudiaLayout(email: EmailContent) {
  expect(email.html).toContain("https://seogeoaeo.ai/claudia-bg-free-logo.png");
  expect(email.html).toContain("https://seogeoaeo.ai/geist-latin.woff2");
  expect(email.html).toContain("max-width:560px");
  expect(email.html).toContain("font-family:Geist,Arial,Helvetica,sans-serif");
  expect(email.html).toContain(">Hi,</p>");
  expect(email.html).toContain(">Claudia</p>");
  expect(email.html).not.toMatch(/background(?:-color)?:/);
  expect(email.html).not.toContain("border-radius");
  expect(email.html).not.toContain("linear-gradient");
  expect(email.html).not.toMatch(/#[0-9a-f]{3,8}/i);
  expect(email.text).toMatch(/^Hi,\n/);
  expect(email.text).toMatch(/\nClaudia$/);
}

describe("Claudia communication emails", () => {
  it("uses the same plain, letter-like shell for every customer email", () => {
    const emails = [
      setupRunCompletedEmail({
        brandName: "Acme",
        summary: "I found three useful opportunities.",
        dashboardUrl: "https://example.com/dashboard",
      }),
      setupRunStalledEmail({
        brandName: "Acme",
        dashboardUrl: "https://example.com/dashboard",
      }),
      articleReviewNeededEmail({
        brandName: "Acme",
        articleTitle: "A safer invoice workflow",
        articleUrl: "https://example.com/articles/1",
        reason: "quality_hold",
      }),
      dailyStandupEmail({
        brandName: "Acme",
        runDate: "2026-07-23",
        articlesWritten: 2,
        topicsResearched: 4,
        failures: 1,
        status: "completed_degraded",
        dashboardUrl: "https://example.com/dashboard",
      }),
      visibilityAlertEmail({
        siteUrl: "https://acme.test",
        reasons: ["The visibility score dropped."],
        dashboardUrl: "https://example.com/visibility/health",
      }),
      weeklyReportEmail({
        brandName: "Acme",
        siteUrl: "https://acme.test",
        lines: ["Published one article."],
        ask: null,
        reportsUrl: "https://example.com/reports",
      }),
      outOfCreditsEmail({
        brandName: "Acme",
        pendingTopics: 3,
        dashboardUrl: "https://example.com/dashboard",
        creditsUrl: "https://example.com/settings?tab=billing",
      }),
    ];

    emails.forEach(expectPlainClaudiaLayout);
  });

  it("renders the setup-complete milestone with one useful action", () => {
    const email = setupRunCompletedEmail({
      brandName: "Acme",
      summary: "I found three useful opportunities.",
      dashboardUrl: "https://example.com/dashboard",
    });

    expect(email.subject).toBe("I finished setting up Acme");
    expect(email.text).toContain("three useful opportunities");
    expect(email.html).toContain('href="https://example.com/dashboard"');
    expect(email.html).toContain("See what I found");
  });

  it("explains why an automatic article needs review", () => {
    const email = articleReviewNeededEmail({
      brandName: "Acme",
      articleTitle: "A safer invoice workflow",
      articleUrl: "https://example.com/articles/1",
      reason: "quality_hold",
    });

    expect(email.subject).toBe("Review: A safer invoice workflow");
    expect(email.text).toContain("needs your judgment");
    expect(email.html).toContain('href="https://example.com/articles/1"');
    expect(email.html).toContain("Review the article");
  });

  it("summarizes the daily run in human language without an unnecessary CTA", () => {
    const email = dailyStandupEmail({
      brandName: "Acme",
      runDate: "2026-07-23",
      articlesWritten: 2,
      topicsResearched: 4,
      failures: 1,
      status: "completed_degraded",
      dashboardUrl: "https://example.com/dashboard",
    });

    expect(email.text).toContain("July 23, 2026");
    expect(email.text).toContain("Wrote 2 articles.");
    expect(email.text).toContain("Researched 4 new topics.");
    expect(email.text).toContain("Held 1 item to try again.");
    expect(email.html).not.toContain("https://example.com/dashboard");
  });

  it("links a credit pause directly to signed-in billing controls", () => {
    const email = outOfCreditsEmail({
      brandName: "Acme",
      pendingTopics: 3,
      dashboardUrl: "https://example.com/dashboard",
      creditsUrl: "https://example.com/settings?tab=billing",
    });

    expect(email.text).toContain("3 researched topics are queued");
    expect(email.html).toContain('href="https://example.com/settings?tab=billing"');
    expect(email.html).not.toContain("https://example.com/dashboard");
  });

  it("uses a specific CTA for the one weekly ask", () => {
    const email = weeklyReportEmail({
      brandName: "Acme",
      siteUrl: "https://acme.test",
      lines: ["Two fixes held up."],
      ask: {
        what: "Two drafts are waiting for your review.",
        href: "https://example.com/articles",
      },
      reportsUrl: "https://example.com/reports",
    });

    expect(email.html).toContain(">Review drafts</a>");
    expect(email.html).not.toContain(">Take care of it</a>");
  });

  it("escapes customer content before placing it in HTML", () => {
    const email = setupRunCompletedEmail({
      brandName: "<Acme>",
      summary: 'Found "one" & another.',
      dashboardUrl: "https://example.com/dashboard?next=1&mode=full",
    });

    expect(email.html).toContain("&lt;Acme&gt;");
    expect(email.html).toContain("Found &quot;one&quot; &amp; another.");
    expect(email.html).toContain("next=1&amp;mode=full");
  });
});
