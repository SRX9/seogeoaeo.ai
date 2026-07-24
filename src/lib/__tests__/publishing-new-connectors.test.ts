import { afterEach, describe, expect, it, vi } from "vitest";
import { beehiivAdapter } from "@/lib/publishing/adapters/beehiiv";
import { buttondownAdapter } from "@/lib/publishing/adapters/buttondown";
import { paragraphAdapter } from "@/lib/publishing/adapters/paragraph";
import { qiitaAdapter } from "@/lib/publishing/adapters/qiita";
import { writeasAdapter } from "@/lib/publishing/adapters/writeas";
import type { PublishArticle } from "@/lib/publishing/types";

const article: PublishArticle = {
  id: "article-1",
  title: "A useful guide",
  slug: "a-useful-guide",
  metaDescription: "A concise description.",
  tags: ["SEO", "Content Marketing"],
  bodyMarkdown: "# Guide\n\nUseful content.",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("new publishing adapters", () => {
  it("creates a public Qiita item with Bearer authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "c686397e4a0f4f11683d",
          url: "https://qiita.com/example/items/c686397e4a0f4f11683d",
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await qiitaAdapter.publish(article, {
      workspaceId: "ws-1",
      config: {},
      secrets: { qiita_access_token: "qiita-token" },
      origin: "https://app.example.com",
    });

    expect(result).toEqual({
      ok: true,
      externalId: "c686397e4a0f4f11683d",
      externalUrl: "https://qiita.com/example/items/c686397e4a0f4f11683d",
    });
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://qiita.com/api/v2/items");
    expect(init.headers).toEqual(
      expect.objectContaining({ authorization: "Bearer qiita-token" }),
    );
    expect(JSON.parse(init.body as string)).toEqual(
      expect.objectContaining({
        private: false,
        tags: [
          { name: "SEO", versions: [] },
          { name: "Content Marketing", versions: [] },
        ],
      }),
    );
  });

  it("publishes beehiiv HTML with an explicit confirmed status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "post_123",
              preview_url: "https://app.beehiiv.com/posts/post_123/preview",
            },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "post_123",
              status: "confirmed",
              web_url: "https://example.beehiiv.com/p/a-useful-guide",
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await beehiivAdapter.publish(article, {
      workspaceId: "ws-1",
      config: { publicationId: "pub_123" },
      secrets: { beehiiv_api_key: "beehiiv-key" },
      origin: "https://app.example.com",
    });

    expect(result).toEqual({
      ok: true,
      externalId: "post_123",
      externalUrl: "https://example.beehiiv.com/p/a-useful-guide",
    });
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe("https://api.beehiiv.com/v2/publications/pub_123/posts");
    expect(init.headers).toEqual(
      expect.objectContaining({ authorization: "Bearer beehiiv-key" }),
    );
    expect(JSON.parse(init.body as string)).toEqual(
      expect.objectContaining({
        status: "confirmed",
        web_settings: { slug: "a-useful-guide" },
        body_content: expect.stringContaining("<h1>Guide</h1>"),
      }),
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.beehiiv.com/v2/publications/pub_123/posts/post_123",
    );
  });

  it("surfaces a definitive beehiiv background failure without a remote ID", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: "post_123",
              preview_url: "https://app.beehiiv.com/posts/post_123/preview",
            },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "POST_CREATION_FAILED",
            message: "Invalid template",
          }),
          { status: 404 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await beehiivAdapter.publish(article, {
      workspaceId: "ws-1",
      config: { publicationId: "pub_123" },
      secrets: { beehiiv_api_key: "beehiiv-key" },
      origin: "https://app.example.com",
    });

    expect(result).toEqual({
      ok: false,
      error: "beehiiv background creation failed: Invalid template",
    });
  });

  it("publishes Markdown to a Write.as collection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 201,
          data: {
            id: "post-id",
            slug: "a-useful-guide",
            collection: { url: "https://write.as/example/" },
          },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await writeasAdapter.publish(article, {
      workspaceId: "ws-1",
      config: { collectionAlias: "example" },
      secrets: { writeas_access_token: "writeas-token" },
      origin: "https://app.example.com",
    });

    expect(result.externalUrl).toBe("https://write.as/example/a-useful-guide");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://write.as/api/collections/example/posts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Token writeas-token",
        }),
      }),
    );
  });

  it("does not send the create-only slug field when updating Write.as", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 200,
          data: {
            id: "post-id",
            slug: "existing-slug",
            collection: { url: "https://write.as/example/" },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await writeasAdapter.publish(article, {
      workspaceId: "ws-1",
      config: { collectionAlias: "example" },
      secrets: { writeas_access_token: "writeas-token" },
      origin: "https://app.example.com",
      externalId: "post-id",
      externalUrl: "https://write.as/example/existing-slug",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      title: article.title,
      body: article.bodyMarkdown,
    });
  });

  it("publishes to Paragraph and resolves the public publication URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "paragraph-post" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await paragraphAdapter.publish(article, {
      workspaceId: "ws-1",
      config: { siteUrl: "https://paragraph.com/@example" },
      secrets: { paragraph_api_key: "paragraph-key" },
      origin: "https://app.example.com",
    });

    expect(result).toEqual({
      ok: true,
      externalId: "paragraph-post",
      externalUrl: "https://paragraph.com/@example/a-useful-guide",
    });
    const [, createInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(createInit.headers).toEqual(
      expect.objectContaining({ authorization: "Bearer paragraph-key" }),
    );
    expect(JSON.parse(createInit.body as string)).toEqual(
      expect.objectContaining({
        sendNewsletter: false,
        markdown: article.bodyMarkdown,
      }),
    );
    expect(JSON.parse(createInit.body as string)).not.toHaveProperty("status");
  });

  it("queues a new public Buttondown email but does not requeue updates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "email-1",
            absolute_url: "https://buttondown.com/example/archive/a-useful-guide/",
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "email-1",
            absolute_url: "https://buttondown.com/example/archive/a-useful-guide/",
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const context = {
      workspaceId: "ws-1",
      config: {},
      secrets: { buttondown_api_key: "buttondown-key" },
      origin: "https://app.example.com",
    };
    await buttondownAdapter.publish(article, context);
    await buttondownAdapter.publish(article, { ...context, externalId: "email-1" });

    const createBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const updateBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(createBody).toEqual(
      expect.objectContaining({
        status: "about_to_send",
        email_type: "public",
        archival_mode: "enabled",
      }),
    );
    expect(updateBody).not.toHaveProperty("status");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ method: "PATCH" }));
  });
});
