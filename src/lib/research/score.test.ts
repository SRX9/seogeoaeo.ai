import { describe, expect, it, vi } from "vitest";
import type { ResearchContext, ResearchFinding } from "./types";

// Force the heuristic path (no LLM) so scores are deterministic.
vi.mock("@/lib/llm/client", () => ({
  getLlmConfig: () => null,
  generateJson: vi.fn(),
}));

import { MIN_SCORE, scoreFindings } from "./score";

const context: ResearchContext = {
  brand: { seedKeywords: null },
  competitors: [],
  seedQueries: [],
  useCases: [],
  ourTitles: [],
};

const finding = (over: Partial<ResearchFinding>): ResearchFinding => ({
  title: "Invoice Reminder Templates",
  source: "gsc",
  sourceType: "gsc_query",
  evidenceUrls: [],
  ...over,
});

describe("scoreFindings with C4 source weights", () => {
  it("a 0.5 weight can drop a topic below the MIN_SCORE cutoff", async () => {
    // gsc_query heuristic: 50 base + 20 source = 70 → ×0.5 = 35 < 45.
    const { topics } = await scoreFindings([finding({})], context, {
      sourceWeights: { gsc_query: 0.5 },
    });
    expect(topics).toHaveLength(0);
  });

  it("a 2.0 weight boosts but never exceeds 100", async () => {
    const { topics } = await scoreFindings([finding({})], context, {
      sourceWeights: { gsc_query: 2 },
    });
    expect(topics).toHaveLength(1);
    expect(topics[0].score).toBeLessThanOrEqual(100);
    expect(topics[0].score).toBeGreaterThan(MIN_SCORE);
  });

  it("no weights = unchanged behavior", async () => {
    const { topics } = await scoreFindings([finding({})], context);
    expect(topics).toHaveLength(1);
    expect(topics[0].score).toBe(70);
  });
});
