import type { LlmTextResult, ModelTier } from "@/lib/llm/client";

export type TokenUsageSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  byTier: Partial<Record<ModelTier, number>>;
  byModel: Record<string, number>;
};

export function emptyTokenUsage(): TokenUsageSummary {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    calls: 0,
    byTier: {},
    byModel: {},
  };
}

export function addTokenUsage(
  summary: TokenUsageSummary,
  result: Pick<LlmTextResult, "tier" | "model" | "usage">,
) {
  if (!result.usage) {
    return summary;
  }

  const next = {
    ...summary,
    promptTokens: summary.promptTokens + result.usage.promptTokens,
    completionTokens: summary.completionTokens + result.usage.completionTokens,
    totalTokens: summary.totalTokens + result.usage.totalTokens,
    calls: summary.calls + 1,
    byTier: { ...summary.byTier },
    byModel: { ...summary.byModel },
  };

  next.byTier[result.tier] = (next.byTier[result.tier] ?? 0) + result.usage.totalTokens;
  next.byModel[result.model] = (next.byModel[result.model] ?? 0) + result.usage.totalTokens;
  return next;
}

export function mergeTokenUsage(...summaries: TokenUsageSummary[]): TokenUsageSummary {
  const merged = emptyTokenUsage();

  for (const summary of summaries) {
    merged.promptTokens += summary.promptTokens;
    merged.completionTokens += summary.completionTokens;
    merged.totalTokens += summary.totalTokens;
    merged.calls += summary.calls;

    for (const [tier, tokens] of Object.entries(summary.byTier)) {
      merged.byTier[tier as ModelTier] = (merged.byTier[tier as ModelTier] ?? 0) + (tokens ?? 0);
    }

    for (const [model, tokens] of Object.entries(summary.byModel)) {
      merged.byModel[model] = (merged.byModel[model] ?? 0) + tokens;
    }
  }

  return merged;
}

