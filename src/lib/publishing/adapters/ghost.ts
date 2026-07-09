import { createHmac } from "node:crypto";
import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";
import { markdownToHtml } from "@/lib/publishing/markdown-html";

function normalizeAdminUrl(adminApiUrl: string) {
  return adminApiUrl.replace(/\/$/, "");
}

function ghostAdminToken(adminApiKey: string) {
  const [id, secret] = adminApiKey.split(":");
  if (!id || !secret) {
    throw new Error("Ghost admin API key must be in id:secret format");
  }

  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT", kid: id }),
  ).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iat: now, exp: now + 300, aud: "/admin/" }),
  ).toString("base64url");
  const signature = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

export const ghostAdapter: PublishingAdapter = {
  id: "ghost",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const adminApiUrl = context.config.adminApiUrl?.trim();
    const adminApiKey = context.secrets.ghost_admin_api_key ?? context.secrets.api_key;

    if (!adminApiUrl) {
      return { ok: false, error: "Ghost admin API URL is not configured" };
    }
    if (!adminApiKey) {
      return { ok: false, error: "Ghost admin API key is not configured" };
    }

    let token: string;
    try {
      token = ghostAdminToken(adminApiKey);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid Ghost admin API key",
      };
    }

    const base = normalizeAdminUrl(adminApiUrl);
    const postPayload = {
      title: article.title,
      slug: article.slug,
      html: markdownToHtml(article.bodyMarkdown),
      status: "published",
      meta_description: article.metaDescription ?? undefined,
      tags: article.tags.map((name) => ({ name })),
    };

    // Ghost Admin API requires `updated_at` for edits — fetch the current post first.
    let endpoint = `${base}/ghost/api/admin/posts/?source=html`;
    let method: "POST" | "PUT" = "POST";
    let postsBody: Record<string, unknown> = postPayload;

    if (context.externalId) {
      const getRes = await fetch(`${base}/ghost/api/admin/posts/${encodeURIComponent(context.externalId)}/`, {
        headers: { authorization: `Ghost ${token}` },
      });
      if (getRes.ok) {
        const existing = (await getRes.json()) as {
          posts?: { id?: string; updated_at?: string; url?: string }[];
        };
        const current = existing.posts?.[0];
        if (current?.updated_at) {
          endpoint = `${base}/ghost/api/admin/posts/${encodeURIComponent(context.externalId)}/?source=html`;
          method = "PUT";
          postsBody = { ...postPayload, updated_at: current.updated_at };
        }
      }
    }

    const response = await fetch(endpoint, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Ghost ${token}`,
      },
      body: JSON.stringify({ posts: [postsBody] }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: `Ghost returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      posts?: { id?: string; url?: string }[];
    };
    const post = data.posts?.[0];
    const url = post?.url;
    if (!url) {
      return { ok: false, error: "Ghost did not return a published post URL" };
    }

    return {
      ok: true,
      externalUrl: url,
      externalId: post?.id ?? context.externalId ?? undefined,
    };
  },
};
