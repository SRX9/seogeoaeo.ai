import { describe, expect, it, afterEach } from "vitest";
import { slugify, parseTags, serializeTags } from "@/lib/articles/format";
import { getLlmConfig, sanitizeLlmText } from "@/lib/llm/client";

describe("article format helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("Hello World: SEO 101!")).toBe("hello-world-seo-101");
  });

  it("round-trips tags", () => {
    const tags = ["seo", "content marketing"];
    expect(parseTags(serializeTags(tags))).toEqual(tags);
  });
});

describe("sanitizeLlmText", () => {
  it("replaces em dashes with a comma-space", () => {
    expect(sanitizeLlmText("Hello—world")).toBe("Hello, world");
    expect(sanitizeLlmText("Hello — world")).toBe("Hello, world");
    expect(sanitizeLlmText("Hello  —  world")).toBe("Hello, world");
  });

  it("handles multiple em dashes and leaves other punctuation alone", () => {
    expect(sanitizeLlmText("One — two — three.")).toBe("One, two, three.");
    expect(sanitizeLlmText("Keep hyphens and en-dashes: pre-built, 10–20.")).toBe(
      "Keep hyphens and en-dashes: pre-built, 10–20.",
    );
  });

  it("is a no-op when no em dash is present", () => {
    expect(sanitizeLlmText("Clean copy, no long dash.")).toBe("Clean copy, no long dash.");
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
