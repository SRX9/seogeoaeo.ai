import type { LlmConfig, ModelTier } from "@/lib/llm/client";

export function resolveModelForTier(config: LlmConfig, tier: ModelTier) {
  return config.models[tier];
}

export function isHeavyTier(tier: ModelTier) {
  return tier === "heavy";
}

export function isLightTier(tier: ModelTier) {
  return tier === "light";
}
