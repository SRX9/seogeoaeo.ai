import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchContext, ResearchFinding } from "./types";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  getLlmConfig: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/llm/client", () => ({
  getLlmConfig: mocks.getLlmConfig,
  generateJson: mocks.generateJson,
}));

vi.mock("@/lib/logging/logger", () => ({
  logWarn: mocks.logWarn,
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
  beforeEach(() => {
    mocks.generateJson.mockReset();
    mocks.getLlmConfig.mockReset();
    mocks.getLlmConfig.mockReturnValue(null);
    mocks.logWarn.mockReset();
  });

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

  it("falls back to deterministic scoring when structured LLM scoring fails", async () => {
    mocks.getLlmConfig.mockReturnValue({});
    mocks.generateJson.mockRejectedValue(
      new Error("LLM JSON failed runtime schema validation: topics.0.score"),
    );

    const { topics, tokenUsage } = await scoreFindings([finding({})], {
      ...context,
      scope: {
        workspaceId: "11111111-1111-4111-8111-111111111111",
        brandId: "22222222-2222-4222-8222-222222222222",
      },
    });

    expect(topics).toHaveLength(1);
    expect(topics[0].score).toBe(70);
    expect(tokenUsage.totalTokens).toBe(0);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "research.scoring_fallback",
      expect.objectContaining({ findings: 1 }),
    );
  });
});
