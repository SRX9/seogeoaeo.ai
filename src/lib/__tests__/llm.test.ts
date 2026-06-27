import { describe, expect, it, afterEach } from "vitest";
import { slugify, parseTags, serializeTags } from "@/lib/articles/format";
import { getLlmConfig } from "@/lib/llm/client";

describe("article format helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("Hello World: SEO 101!")).toBe("hello-world-seo-101");
  });

  it("round-trips tags", () => {
    const tags = ["seo", "content marketing"];
    expect(parseTags(serializeTags(tags))).toEqual(tags);
  });
});

describe("getLlmConfig", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("returns null when env is incomplete", () => {
    delete process.env.LLM_BASE_URL;
    expect(getLlmConfig()).toBeNull();
  });

  it("returns config when env is complete", () => {
    process.env.LLM_BASE_URL = "https://api.openai.com/v1";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_LIGHT_MODEL = "gpt-4o-mini";
    process.env.LLM_HEAVY_MODEL = "gpt-4o";
    process.env.LLM_IMAGE_MODEL = "dall-e-3";
    const config = getLlmConfig();
    expect(config?.models.light).toBe("gpt-4o-mini");
    expect(config?.models.heavy).toBe("gpt-4o");
  });
});
