import { describe, expect, it, vi } from "vitest";
import { markdownExportAdapter } from "@/lib/publishing/adapters/markdown";
import { webhookAdapter } from "@/lib/publishing/adapters/webhook";
import { hashnodeAdapter } from "@/lib/publishing/adapters/hashnode";
import type { PublishArticle } from "@/lib/publishing/types";

const sampleArticle: PublishArticle = {
  id: "article-1",
  title: "Hello World",
  slug: "hello-world",
  metaDescription: "A test article",
  tags: ["seo", "content"],
  bodyMarkdown: "# Hello\n\nThis is a test.",
};

describe("publishing adapters", () => {
  it("builds markdown export URL", async () => {
    const result = await markdownExportAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: {},
      secrets: {},
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.externalUrl).toBe("https://app.example.com/api/articles/article-1/export");
  });

  it("posts webhook payloads with bearer auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await webhookAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { webhookUrl: "https://hooks.example.com/articles" },
      secrets: { webhook_bearer_token: "secret-token" },
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example.com/articles",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer secret-token",
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("publishes to Hashnode with the publishPost mutation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { publishPost: { post: { url: "https://blog.example.com/post" } } } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await hashnodeAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { publicationId: "pub-1" },
      secrets: { hashnode_token: "hashnode-token" },
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.externalUrl).toBe("https://blog.example.com/post");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.query).toContain("publishPost");
    expect(body.variables.input.publicationId).toBe("pub-1");

    vi.unstubAllGlobals();
  });

  it("surfaces Hashnode GraphQL errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: "Invalid token" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await hashnodeAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { publicationId: "pub-1" },
      secrets: { hashnode_token: "bad" },
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid token");

    vi.unstubAllGlobals();
  });

  it("captures webhook failures without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await webhookAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { webhookUrl: "https://hooks.example.com/articles" },
      secrets: {},
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");

    vi.unstubAllGlobals();
  });

  it("labels missing Hashnode tokens accurately", async () => {
    const result = await hashnodeAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { publicationId: "pub-1" },
      secrets: {},
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("personal access token");
  });
});
