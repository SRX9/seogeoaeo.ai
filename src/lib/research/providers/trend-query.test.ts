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

  it("returns deterministic questions when structured LLM output cannot be repaired", async () => {
    mocks.generateJson.mockRejectedValue(
      new Error("LLM JSON failed runtime schema validation: queries.0.intent"),
    );

    const findings = await trendQueryProvider.discover(context);

    expect(findings).toHaveLength(6);
    expect(findings.every((finding) => finding.sourceType === "trend_query")).toBe(true);
    expect(findings[0]).toMatchObject({
      query: "What is invoice automation and how does it work?",
      title: "What is invoice automation and how does it work?",
    });
    expect(mocks.logWarn).toHaveBeenCalledWith(
      "research.trend_query_fallback",
      expect.objectContaining({
        workspaceId: context.scope?.workspaceId,
        brandId: context.scope?.brandId,
      }),
    );
  });
});
