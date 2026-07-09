import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";

export const devtoAdapter: PublishingAdapter = {
  id: "devto",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const apiKey = context.secrets.devto_api_key ?? context.secrets.api_key;
    if (!apiKey) {
      return { ok: false, error: "Dev.to API key is not configured" };
    }

    const payload = {
      article: {
        title: article.title,
        body_markdown: article.bodyMarkdown,
        published: true,
        tags: article.tags.slice(0, 4).join(","),
        description: article.metaDescription ?? undefined,
      },
    };

    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `https://dev.to/api/articles/${encodeURIComponent(context.externalId!)}`
      : "https://dev.to/api/articles";

    const response = await fetch(endpoint, {
      method: isUpdate ? "PUT" : "POST",
      headers: {
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: `Dev.to returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as { id?: number | string; url?: string };
    return {
      ok: true,
      externalUrl: data.url,
      externalId: data.id != null ? String(data.id) : context.externalId ?? undefined,
    };
  },
};
