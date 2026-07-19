import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchContext } from "@/lib/research/types";

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/llm/client", () => ({
  generateJson: mocks.generateJson,
  getLlmConfig: () => ({}),
}));

vi.mock("@/lib/logging/logger", () => ({
  logWarn: mocks.logWarn,
}));

import { trendQueryProvider } from "./trend-query";

const context: ResearchContext = {
  brand: {
    name: "Acme",
    audience: "finance teams",
    seedKeywords: "invoice automation, payment reminders",
  },
  competitors: [],
  seedQueries: ["invoice automation"],
  useCases: [],
  ourTitles: [],
  scope: {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    brandId: "22222222-2222-4222-8222-222222222222",
  },
};

describe("trendQueryProvider", () => {
  beforeEach(() => {
    mocks.generateJson.mockReset();
    mocks.logWarn.mockReset();
  });

  it("returns no findings when structured LLM output cannot be repaired", async () => {
    mocks.generateJson.mockRejectedValue(
      new Error("LLM JSON failed runtime schema validation: queries.0.intent"),
    );

    const findings = await trendQueryProvider.discover(context);

    expect(findings).toEqual([]);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "research.trend_query_failed",
      expect.objectContaining({
        workspaceId: context.scope?.workspaceId,
        brandId: context.scope?.brandId,
        reason: "LLM JSON failed runtime schema validation: queries.0.intent",
      }),
    );
  });

  it("returns no findings when the LLM returns an empty query list", async () => {
    mocks.generateJson.mockResolvedValue({ data: { queries: [] } });

    const findings = await trendQueryProvider.discover(context);

    expect(findings).toEqual([]);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "research.trend_query_failed",
      expect.objectContaining({ reason: "LLM returned an empty query list" }),
    );
  });
});
