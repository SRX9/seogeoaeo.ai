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
    const appPassword = context.secrets.api_key;

    if (!siteUrl) {
      return { ok: false, error: "WordPress site URL is not configured" };
    }
    if (!username || !appPassword) {
      return { ok: false, error: "WordPress username and application password are required" };
    }

    const endpoint = `${normalizeSiteUrl(siteUrl)}/wp-json/wp/v2/posts`;
    const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        title: article.title,
        content: markdownToHtml(article.bodyMarkdown),
        status: "publish",
        slug: article.slug,
        excerpt: article.metaDescription ?? undefined,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: `WordPress returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as { link?: string };
    return { ok: true, externalUrl: data.link };
  },
};
