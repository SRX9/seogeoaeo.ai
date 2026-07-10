import { describe, expect, it, vi } from "vitest";
import { markdownExportAdapter } from "@/lib/publishing/adapters/markdown";
import { webhookAdapter } from "@/lib/publishing/adapters/webhook";
import { hashnodeAdapter } from "@/lib/publishing/adapters/hashnode";
import { devtoAdapter } from "@/lib/publishing/adapters/devto";
import { wordpressAdapter } from "@/lib/publishing/adapters/wordpress";
import { ghostAdapter } from "@/lib/publishing/adapters/ghost";
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

  it("publishes to Dev.to with array tags and sanitized multi-word tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 42, url: "https://dev.to/u/hello-world" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const longDescription = "x".repeat(200);
    const result = await devtoAdapter.publish(
      {
        ...sampleArticle,
        metaDescription: longDescription,
        tags: ["Content Marketing", "SEO Tips", "javascript", "Content Marketing", "extra"],
      },
      {
        workspaceId: "ws-1",
        config: {},
        secrets: { devto_api_key: "devto-key" },
        origin: "https://app.example.com",
      },
    );

    expect(result.ok).toBe(true);
    expect(result.externalUrl).toBe("https://dev.to/u/hello-world");
    expect(result.externalId).toBe("42");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual(
      expect.objectContaining({
        "api-key": "devto-key",
        accept: "application/vnd.forem.api-v1+json",
      }),
    );

    const body = JSON.parse(init.body as string);
    // Tags must be an array (not "a,b,c"), lowercase, no spaces, max 4, unique.
    expect(body.article.tags).toEqual([
      "content-marketing",
      "seo-tips",
      "javascript",
      "extra",
    ]);
    expect(body.article.description).toHaveLength(150);
    expect(body.article.published).toBe(true);

    vi.unstubAllGlobals();
  });

  it("updates an existing Dev.to article with PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 99, url: "https://dev.to/u/updated" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await devtoAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: {},
      secrets: { devto_api_key: "devto-key" },
      origin: "https://app.example.com",
      externalId: "99",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.to/api/articles/99",
      expect.objectContaining({ method: "PUT" }),
    );

    vi.unstubAllGlobals();
  });

  it("surfaces Dev.to HTTP errors without throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await devtoAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: {},
      secrets: { devto_api_key: "bad" },
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");

    vi.unstubAllGlobals();
  });

  it("requires a Dev.to API key", async () => {
    const result = await devtoAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: {},
      secrets: {},
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API key");
  });

  it("publishes to WordPress and strips spaces from application passwords", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 7, link: "https://blog.example.com/hello-world" }), {
        status: 201,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await wordpressAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { siteUrl: "https://blog.example.com/wp-json", username: "editor" },
      secrets: { wordpress_application_password: "abcd efgh ijkl mnop" },
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.externalUrl).toBe("https://blog.example.com/hello-world");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://blog.example.com/wp-json/wp/v2/posts",
      expect.objectContaining({ method: "POST" }),
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const expectedAuth = Buffer.from("editor:abcdefghijklmnop").toString("base64");
    expect(init.headers).toEqual(
      expect.objectContaining({ authorization: `Basic ${expectedAuth}` }),
    );

    vi.unstubAllGlobals();
  });

  it("publishes to Ghost with Accept-Version and id:secret JWT", async () => {
    // 32-byte hex secret (Ghost Admin API key format id:hex_secret)
    const secret = "a".repeat(64);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          posts: [{ id: "ghost-1", url: "https://blog.example.com/hello-world/" }],
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ghostAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { adminApiUrl: "https://blog.example.com/ghost" },
      secrets: { ghost_admin_api_key: `keyid:${secret}` },
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(true);
    expect(result.externalUrl).toBe("https://blog.example.com/hello-world/");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://blog.example.com/ghost/api/admin/posts/?source=html",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "accept-version": "v5.0",
          authorization: expect.stringMatching(/^Ghost /),
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("rejects Ghost keys that are not id:secret", async () => {
    const result = await ghostAdapter.publish(sampleArticle, {
      workspaceId: "ws-1",
      config: { adminApiUrl: "https://blog.example.com" },
      secrets: { ghost_admin_api_key: "not-a-valid-key" },
      origin: "https://app.example.com",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("id:secret");
  });
});
