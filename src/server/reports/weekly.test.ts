import { describe, expect, it } from "vitest";
import { pickTheAsk, renderReportLines, type WeeklyReportData } from "./weekly";

const base = (over: Partial<WeeklyReportData> = {}): WeeklyReportData => ({
  brandName: "Acme",
  siteUrl: "https://acme.com",
  weekStart: "2026-07-06",
  proof: {
    score: { current: 68, baseline: 61, delta: 7 },
    firstWeek: false,
    answerShare: [{ engine: "chatgpt", appeared: 4, prompts: 10 }],
    traffic: { clicks: 120, prevClicks: 100, aiReferrals: 6 },
  },
  fixes: {
    applied: 3,
    proposed: 2,
    verified: 2,
    awaiting: 0,
    examples: ["Missing Organization schema"],
  },
  content: {
    published: [{ title: "Invoice Reminders That Work", externalUrl: "https://acme.com/blog/x", thesis: null }],
    performance: ['"Best Invoicing" is winning — #6 in search; I queued follow-ups.'],
    nextWeek: [{ title: "Invoice Reminder Templates", thesis: "Google shows you at #14." }],
    draftsAwaitingReview: 0,
  },
  ask: null,
  ...over,
});

describe("renderReportLines", () => {
  it("orders the full report by the proof stack: score, answers, traffic, fixes, content", () => {
    const lines = renderReportLines(base());
    expect(lines[0]).toContain("61 → 68 (+7)");
    expect(lines[1]).toContain("4 of 10 tracked chatgpt answers");
    expect(lines[2]).toContain("120 clicks");
    expect(lines[2]).toContain("+20%");
    expect(lines[2]).toContain("6 visits from AI assistants");
    expect(lines.some((l) => l.includes("applied 3 fixes") && l.includes("verified 2"))).toBe(true);
    expect(lines.some((l) => l.includes('"Invoice Reminders That Work"'))).toBe(true);
    expect(lines.at(-1)).toContain('Next up: "Invoice Reminder Templates"');
  });

  it("frames a single-audit brand as the baseline week, never a zero delta", () => {
    const lines = renderReportLines(
      base({ proof: { ...base().proof, firstWeek: true, score: { current: 61, baseline: null, delta: 0 } } }),
    );
    expect(lines[0]).toContain("baseline week");
    expect(lines[0]).not.toContain("held at");
  });

  it("omits the traffic line entirely before GSC connects", () => {
    const lines = renderReportLines(base({ proof: { ...base().proof, traffic: null } }));
    expect(lines.some((l) => l.includes("clicks this week"))).toBe(false);
  });

  it("says nothing about content on a no-content week", () => {
    const lines = renderReportLines(
      base({
        content: { published: [], performance: [], nextWeek: [], draftsAwaitingReview: 0 },
        fixes: { applied: 0, proposed: 0, verified: 0, awaiting: 0, examples: [] },
      }),
    );
    expect(lines.some((l) => l.includes("published"))).toBe(false);
    expect(lines.some((l) => l.includes("fix"))).toBe(false);
  });
});

describe("pickTheAsk", () => {
  it("connect-GSC outranks everything", () => {
    const data = base({
      fixes: { ...base().fixes, awaiting: 5 },
      content: { ...base().content, draftsAwaitingReview: 3 },
    });
    const ask = pickTheAsk(data, false);
    expect(ask?.href).toBe("/settings?tab=integrations");
  });

  it("then approving prepared fixes", () => {
    const ask = pickTheAsk(base({ fixes: { ...base().fixes, awaiting: 2 } }), true);
    expect(ask?.href).toBe("/visibility/fixes");
    expect(ask?.what).toContain("2 fixes are ready");
  });

  it("then reviewing drafts", () => {
    const ask = pickTheAsk(base({ content: { ...base().content, draftsAwaitingReview: 1 } }), true);
    expect(ask?.href).toBe("/articles");
  });

  it("and asks for nothing when there's nothing to ask — never two asks", () => {
    expect(pickTheAsk(base(), true)).toBeNull();
  });
});
