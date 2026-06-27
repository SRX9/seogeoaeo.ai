import { describe, expect, it } from "vitest";
import { resolveModelForTier, isHeavyTier, isLightTier } from "@/lib/llm/routing";

const config = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test",
  models: {
    light: "gpt-4o-mini",
    heavy: "gpt-4o",
    image: "dall-e-3",
  },
};

describe("llm routing", () => {
  it("routes light and heavy tiers to configured models", () => {
    expect(resolveModelForTier(config, "light")).toBe("gpt-4o-mini");
    expect(resolveModelForTier(config, "heavy")).toBe("gpt-4o");
    expect(resolveModelForTier(config, "image")).toBe("dall-e-3");
  });

  it("identifies tier classes", () => {
    expect(isLightTier("light")).toBe(true);
    expect(isHeavyTier("heavy")).toBe(true);
    expect(isHeavyTier("light")).toBe(false);
  });
});
