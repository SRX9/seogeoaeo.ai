import { describe, expect, it } from "vitest";
import { addTokenUsage, emptyTokenUsage, mergeTokenUsage } from "@/lib/llm/usage";

describe("token usage helpers", () => {
  it("accumulates usage across calls", () => {
    let summary = emptyTokenUsage();
    summary = addTokenUsage(summary, {
      tier: "light",
      model: "gpt-4o-mini",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
    summary = addTokenUsage(summary, {
      tier: "heavy",
      model: "gpt-4o",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    });

    expect(summary.totalTokens).toBe(165);
    expect(summary.calls).toBe(2);
    expect(summary.byTier.light).toBe(15);
    expect(summary.byTier.heavy).toBe(150);
  });

  it("merges summaries", () => {
    const a = addTokenUsage(emptyTokenUsage(), {
      tier: "light",
      model: "gpt-4o-mini",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    const b = addTokenUsage(emptyTokenUsage(), {
      tier: "heavy",
      model: "gpt-4o",
      usage: { promptTokens: 3, completionTokens: 3, totalTokens: 6 },
    });

    const merged = mergeTokenUsage(a, b);
    expect(merged.totalTokens).toBe(8);
    expect(merged.calls).toBe(2);
  });
});
