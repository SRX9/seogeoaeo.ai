import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";
import { markdownToHtml } from "@/lib/publishing/markdown-html";

function normalizeSiteUrl(siteUrl: string) {
  return siteUrl.replace(/\/$/, "");
}

export const wordpressAdapter: PublishingAdapter = {
  id: "wordpress",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const siteUrl = context.config.siteUrl?.trim();
    const username = context.config.username?.trim();
    const appPassword = context.secrets.wordpress_application_password ?? context.secrets.api_key;

    if (!siteUrl) {
      return { ok: false, error: "WordPress site URL is not configured" };
    }
    if (!username || !appPassword) {
      return { ok: false, error: "WordPress username and application password are required" };
    }

    const base = normalizeSiteUrl(siteUrl);
    const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const body = {
      title: article.title,
      content: markdownToHtml(article.bodyMarkdown),
      status: "publish",
      slug: article.slug,
      excerpt: article.metaDescription ?? undefined,
    };

    // Update an existing post when we have its remote id; otherwise create.
    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `${base}/wp-json/wp/v2/posts/${encodeURIComponent(context.externalId!)}`
      : `${base}/wp-json/wp/v2/posts`;

    const response = await fetch(endpoint, {
      method: isUpdate ? "POST" : "POST", // WP REST uses POST for both create and update
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: `WordPress returned ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as { id?: number | string; link?: string };
    return {
      ok: true,
      externalUrl: data.link,
      externalId: data.id != null ? String(data.id) : context.externalId ?? undefined,
    };
  },
};
