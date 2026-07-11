import { describe, expect, it } from "vitest";
import {
  clusterQueryFamilies,
  GSC_MINING,
  mineCtrGaps,
  mineFamilyGaps,
  mineStrikingDistance,
  type SearchQueryRow,
} from "./gsc-queries";

const row = (over: Partial<SearchQueryRow>): SearchQueryRow => ({
  query: "invoice reminders",
  page: "https://example.com/blog/invoices",
  clicks: 10,
  impressions: 200,
  position: 12,
  ...over,
});

describe("mineStrikingDistance", () => {
  it("turns a #14 query with impressions into a topic with a numeric thesis", () => {
    const findings = mineStrikingDistance([
      row({ query: "best invoicing software for freelancers", position: 14.3, impressions: 480 }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].sourceType).toBe("gsc_query");
    expect(findings[0].source).toBe("gsc");
    expect(findings[0].intentTier).toBe("bofu"); // "best …" is a buyer pattern
    expect(findings[0].thesis).toContain("#14");
    expect(findings[0].thesis).toContain("480 impressions/mo");
    expect(findings[0].evidenceUrls).toEqual(["https://example.com/blog/invoices"]);
  });

  it("ignores queries outside the 8-25 band or below the impression floor", () => {
    expect(mineStrikingDistance([row({ position: 3 })])).toHaveLength(0);
    expect(mineStrikingDistance([row({ position: 40 })])).toHaveLength(0);
    expect(mineStrikingDistance([row({ impressions: 10 })])).toHaveLength(0);
    expect(mineStrikingDistance([row({ position: null })])).toHaveLength(0);
  });

  it("orders by impressions, biggest opportunity first", () => {
    const findings = mineStrikingDistance([
      row({ query: "small win", impressions: 60 }),
      row({ query: "big win", impressions: 900 }),
    ]);
    expect(findings[0].query).toBe("big win");
  });

  it("is deterministic: same input, same output", () => {
    const input = [row({ query: "alpha", impressions: 100 }), row({ query: "beta", impressions: 90 })];
    expect(mineStrikingDistance(input)).toEqual(mineStrikingDistance(input));
  });
});

describe("mineCtrGaps", () => {
  const brand = { name: "Acme", productDescription: "Acme automates invoices. It saves hours." };

  it("emits a meta-rewrite fix for a page-1 ranking clicked below the curve", () => {
    // Position 3 expects 11% CTR; 1% is far below half of that.
    const fixes = mineCtrGaps([row({ position: 3, impressions: 1000, clicks: 10 })], brand);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].category).toBe("search_ctr");
    expect(fixes[0].fix_capability).toBe("auto");
    const payload = fixes[0].fix_payload as { kind: string; url: string; suggested: { title: string; description: string } };
    expect(payload.kind).toBe("meta_tags");
    expect(payload.url).toBe("https://example.com/blog/invoices");
    expect(payload.suggested.title).toContain("Acme");
    expect(payload.suggested.title.length).toBeLessThanOrEqual(60);
    expect(payload.suggested.description.length).toBeLessThanOrEqual(155);
  });

  it("leaves healthy CTRs and page-2 rankings alone", () => {
    // Position 3 at 8% CTR: above half of the expected 11%.
    expect(mineCtrGaps([row({ position: 3, impressions: 1000, clicks: 80 })], brand)).toHaveLength(0);
    // Page 2 is a striking-distance case, not a CTR case.
    expect(mineCtrGaps([row({ position: 14, impressions: 1000, clicks: 1 })], brand)).toHaveLength(0);
  });
});

describe("query families", () => {
  // Impressions spread across three pages: no page owns >60% of the family.
  const familyRows = [
    row({ query: "invoice reminder email", page: "https://example.com/a", impressions: 60 }),
    row({ query: "invoice reminders for clients", page: "https://example.com/b", impressions: 50 }),
    row({ query: "invoice reminder templates", page: "https://example.com/c", impressions: 40 }),
  ];

  it("clusters queries sharing a normalized head bigram", () => {
    const families = clusterQueryFamilies(familyRows);
    expect(families).toHaveLength(1);
    expect(families[0].head).toBe("invoice reminder");
    expect(families[0].impressions).toBe(150);
    expect(families[0].pages).toHaveLength(3);
  });

  it("emits a cluster-head topic when no page dominates", () => {
    const findings = mineFamilyGaps(clusterQueryFamilies(familyRows));
    expect(findings).toHaveLength(1);
    expect(findings[0].thesis).toContain("150 impressions/mo");
    expect(findings[0].thesis).toContain('"invoice reminder"');
  });

  it("skips families a single page already owns", () => {
    const dominated = familyRows.map((r) => ({ ...r, page: "https://example.com/a" }));
    expect(mineFamilyGaps(clusterQueryFamilies(dominated))).toHaveLength(0);
  });

  it("skips tiny families", () => {
    expect(
      clusterQueryFamilies(familyRows.slice(0, GSC_MINING.family.minQueries - 1)),
    ).toHaveLength(0);
  });
});
