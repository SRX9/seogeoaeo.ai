import { describe, expect, it } from "vitest";
import {
  boundedWeight,
  pageMatches,
  PERFORMANCE,
  readPageMetrics,
  targetQueriesForTopic,
  verdictFor,
  type SearchQueryRow,
} from "./performance";

const row = (over: Partial<SearchQueryRow>): SearchQueryRow => ({
  query: "invoice reminders",
  page: "https://example.com/blog/invoices",
  clicks: 10,
  impressions: 100,
  position: 9,
  ...over,
});

describe("pageMatches", () => {
  it("normalizes scheme, host case, and trailing slashes", () => {
    expect(pageMatches("https://Example.com/blog/post/", "http://example.com/blog/post")).toBe(true);
    expect(pageMatches("https://example.com/blog/a", "https://example.com/blog/b")).toBe(false);
  });
});

describe("targetQueriesForTopic", () => {
  it("merges the evidence query with keywords, lowercased and deduped", () => {
    const queries = targetQueriesForTopic({
      keywords: "Invoice Reminders, payment chasing",
      evidenceJson: JSON.stringify({ query: "invoice reminders" }),
    });
    expect(queries).toEqual(["invoice reminders", "payment chasing"]);
  });

  it("survives malformed evidence", () => {
    expect(targetQueriesForTopic({ keywords: "a", evidenceJson: "{oops" })).toEqual(["a"]);
  });
});

describe("readPageMetrics", () => {
  it("sums page rows plus target-query rows, position weighted by page impressions", () => {
    const rows = [
      row({ page: "https://example.com/blog/invoices", impressions: 100, clicks: 10, position: 8 }),
      row({ query: "payment chasing", page: "https://example.com/other", impressions: 50, clicks: 2, position: 20 }),
      row({ query: "unrelated", page: "https://example.com/unrelated", impressions: 999 }),
    ];
    const metrics = readPageMetrics(rows, "https://example.com/blog/invoices", ["payment chasing"]);
    expect(metrics.impressions).toBe(150);
    expect(metrics.clicks).toBe(12);
    expect(metrics.position).toBe(8); // only the page's own rows weight position
  });
});

describe("verdictFor", () => {
  it("is watching without GSC data", () => {
    expect(verdictFor(28, null)).toBe("watching");
  });

  it("wins on page 1 with a healthy CTR", () => {
    expect(verdictFor(28, { impressions: 200, clicks: 10, position: 6 })).toBe("winner");
  });

  it("stalls on page 1 with a starved CTR", () => {
    expect(verdictFor(28, { impressions: 1000, clicks: 3, position: 4 })).toBe("stalling");
  });

  it("stalls when stuck in the 8-25 band", () => {
    expect(verdictFor(28, { impressions: 300, clicks: 5, position: 14 })).toBe("stalling");
  });

  it("wins on strong growth vs the prior checkpoint even off page 1", () => {
    expect(
      verdictFor(28, { impressions: 300, clicks: 12, position: 30 }, [{ day: 7, impressions: 100 }]),
    ).toBe("winner");
  });

  it("is dead only at day 90 with negligible impressions", () => {
    expect(verdictFor(90, { impressions: 5, clicks: 0, position: null })).toBe("dead");
    expect(verdictFor(28, { impressions: 5, clicks: 0, position: null })).toBe("watching");
    expect(verdictFor(7, { impressions: 5, clicks: 0, position: null })).toBe("watching");
  });

  it("stays watching below the confidence floor", () => {
    expect(verdictFor(28, { impressions: PERFORMANCE.minImpressions - 1, clicks: 1, position: 5 })).toBe(
      "watching",
    );
  });
});

describe("boundedWeight", () => {
  it("stays within [0.5, 2.0]", () => {
    expect(boundedWeight(1, 100)).toBe(2);
    expect(boundedWeight(0, 100)).toBe(0.5);
  });

  it("is neutral at a 50% win rate", () => {
    expect(boundedWeight(0.5, 10)).toBe(1);
  });

  it("shrinks toward 1 on small samples", () => {
    const small = boundedWeight(1, 2);
    const large = boundedWeight(1, 20);
    expect(small).toBeGreaterThan(1);
    expect(small).toBeLessThan(large);
    expect(large).toBe(2);
  });
});
