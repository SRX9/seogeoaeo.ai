import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPageSpeed, isPsiConfigured, parsePsiResponse } from "./pagespeed";

const PSI_BODY = {
  lighthouseResult: {
    categories: {
      performance: { score: 0.42 },
      accessibility: { score: 0.91 },
      "best-practices": { score: 1 },
      seo: { score: 0.85 },
    },
    audits: {
      "largest-contentful-paint": { numericValue: 4200 },
      "cumulative-layout-shift": { numericValue: 0.31 },
      "total-blocking-time": { numericValue: 850 },
      "render-blocking-resources": {
        title: "Eliminate render-blocking resources",
        score: 0.3,
        displayValue: "Potential savings of 1,200 ms",
        details: { type: "opportunity", overallSavingsMs: 1200 },
      },
      "unsized-images": {
        title: "Image elements do not have explicit width and height",
        score: 0.5,
        details: { type: "opportunity", overallSavingsMs: 300 },
      },
      "passing-opportunity": {
        title: "Already fine",
        score: 0.95,
        details: { type: "opportunity", overallSavingsMs: 5000 },
      },
      "not-an-opportunity": { title: "Diagnostics", score: 0, details: { type: "table" } },
    },
  },
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: "AVERAGE" },
      INTERACTION_TO_NEXT_PAINT: { percentile: 620, category: "SLOW" },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8, category: "FAST" },
    },
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parsePsiResponse", () => {
  it("extracts category scores, field data, lab metrics, and ranked opportunities", () => {
    const result = parsePsiResponse(PSI_BODY);
    expect(result.scores).toEqual({
      performance: 42,
      accessibility: 91,
      bestPractices: 100,
      seo: 85,
    });
    expect(result.fieldData).toMatchObject({
      lcpMs: 3100,
      inpMs: 620,
      cls: 0.08, // CrUX reports CLS ×100
      ratings: { lcp: "AVERAGE", inp: "SLOW", cls: "FAST" },
    });
    expect(result.lab).toEqual({ lcpMs: 4200, cls: 0.31, tbtMs: 850 });
    // Sorted by savings, passing (score ≥ 0.9) and non-opportunity audits excluded.
    expect(result.opportunities.map((o) => o.id)).toEqual([
      "render-blocking-resources",
      "unsized-images",
    ]);
    expect(result.opportunities[0].displayValue).toBe("Potential savings of 1,200 ms");
  });

  it("returns null field data when CrUX has no metrics", () => {
    const result = parsePsiResponse({ lighthouseResult: PSI_BODY.lighthouseResult });
    expect(result.fieldData).toBeNull();
    expect(result.scores.performance).toBe(42);
  });

  it("tolerates an empty body", () => {
    const result = parsePsiResponse({});
    expect(result.scores.performance).toBeNull();
    expect(result.opportunities).toEqual([]);
  });
});

describe("fetchPageSpeed", () => {
  it("is not configured and returns null without an API key", async () => {
    vi.stubEnv("GOOGLE_PSI_API_KEY", "");
    expect(isPsiConfigured()).toBe(false);
    const fetchImpl = vi.fn();
    expect(await fetchPageSpeed("https://acme.example/", { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches and parses a successful response", async () => {
    vi.stubEnv("GOOGLE_PSI_API_KEY", "test-key");
    expect(isPsiConfigured()).toBe(true);
    const fetchImpl = vi.fn(
      async (_input: unknown, _init?: unknown) => new Response(JSON.stringify(PSI_BODY), { status: 200 }),
    );
    const result = await fetchPageSpeed("https://acme.example/", { fetchImpl });
    expect(result?.scores.performance).toBe(42);
    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toContain("strategy=mobile");
    expect(calledUrl).toContain("key=test-key");
    expect(calledUrl).toContain("category=BEST_PRACTICES");
  });

  it("returns null on a non-200 response (quota, bad URL)", async () => {
    vi.stubEnv("GOOGLE_PSI_API_KEY", "test-key");
    const fetchImpl = vi.fn(async () => new Response("quota", { status: 429 }));
    expect(await fetchPageSpeed("https://acme.example/", { fetchImpl })).toBeNull();
  });

  it("returns null when the request throws (timeout, network)", async () => {
    vi.stubEnv("GOOGLE_PSI_API_KEY", "test-key");
    const fetchImpl = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await fetchPageSpeed("https://acme.example/", { fetchImpl })).toBeNull();
  });
});
