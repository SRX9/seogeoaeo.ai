import { z } from "zod";
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { slugify, parseTags, serializeTags } from "@/lib/articles/format";
import {
  generateImage,
  generateJson,
  generateText,
  getLlmConfig,
  sanitizeLlmText,
} from "@/lib/llm/client";

vi.mock("@/lib/db", () => ({
  getDb: () => ({ insert: () => ({ values: async () => undefined }) }),
}));

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
  it("replaces long dash punctuation with a comma and space", () => {
    expect(sanitizeLlmText("Hello\u2014world")).toBe("Hello, world");
    expect(sanitizeLlmText("Hello \u2013 world")).toBe("Hello, world");
    expect(sanitizeLlmText("Hello  --  world")).toBe("Hello, world");
  });

  it("handles multiple long dashes and leaves word hyphens alone", () => {
    expect(sanitizeLlmText("One \u2014 two \u2013 three.")).toBe("One, two, three.");
    expect(sanitizeLlmText("Keep word hyphens: pre-built.")).toBe("Keep word hyphens: pre-built.");
  });

  it("is a no-op when no long dash is present", () => {
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

describe("hardened LLM transport", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.LLM_BASE_URL = "https://llm.example/v1";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_LIGHT_MODEL = "light-model";
    process.env.LLM_HEAVY_MODEL = "heavy-model";
    process.env.LLM_IMAGE_MODEL = "image-model";
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.unstubAllGlobals();
  });

  it("enforces the JSON contract and sends deterministic sampling controls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"count":"wrong"}' }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateJson(
        "light",
        [{ role: "user", content: "Return a count." }],
        {
          schema: z.object({ count: z.number() }),
          seed: 42,
          maxRetries: 0,
          maxRepairAttempts: 0,
        },
      ),
    ).rejects.toMatchObject({
      errorClass: "invalid_response",
      retryable: false,
      message: expect.stringContaining("count"),
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      temperature: 0,
      seed: 42,
      response_format: { type: "json_object" },
    });
  });

  it("uses validation details to repair structured output twice", async () => {
    const completion = (content: string) =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content }, finish_reason: "stop" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(completion('{"count":"seven"}'))
      .mockResolvedValueOnce(completion('{"total":7}'))
      .mockResolvedValueOnce(completion('{"count":7}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateJson(
      "light",
      [{ role: "user", content: "Return a count." }],
      {
        schema: z.object({ count: z.number() }),
        maxRetries: 0,
      },
    );

    expect(result.data).toEqual({ count: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstRepair = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    const secondRepair = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body));
    expect(firstRepair.messages.at(-1)?.content).toMatch(/count: Expected number/i);
    expect(secondRepair.messages.at(-1)?.content).toMatch(/count: Required/i);
  });

  it("keeps the timeout active while consuming the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal as AbortSignal;
        const body = new ReadableStream({
          start(controller) {
            signal.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }),
    );

    await expect(
      generateText("light", [{ role: "user", content: "Wait forever." }], {
        timeoutMs: 5,
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ errorClass: "timeout", retryable: true });
  });

  it("classifies moderation blocks and malformed image JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":{"code":"content_policy_violation"}}', { status: 400 }),
      )
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateText("light", [{ role: "user", content: "Blocked." }], { maxRetries: 0 }),
    ).rejects.toMatchObject({ errorClass: "moderation", retryable: false });
    await expect(generateImage("An image", { maxRetries: 0 })).rejects.toMatchObject({
      errorClass: "invalid_response",
      retryable: false,
    });
  });
});
