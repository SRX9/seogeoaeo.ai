import { publishFetch } from "@/lib/publishing/fetch";
import { normalizeTagSlugs } from "@/lib/publishing/tags";
import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";

/** Dev.to description max length (Forem Article model). */
const DEVTO_DESCRIPTION_MAX = 150;

export const devtoAdapter: PublishingAdapter = {
  id: "devto",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const apiKey = context.secrets.devto_api_key ?? context.secrets.api_key;
    if (!apiKey) {
      return { ok: false, error: "Dev.to API key is not configured" };
    }

    const description = article.metaDescription?.trim();
    const payload = {
      article: {
        title: article.title,
        body_markdown: article.bodyMarkdown,
        published: true,
        // Forem expects an array of strings, not a comma-joined string.
        tags: normalizeTagSlugs(article.tags, { max: 4, maxLen: 30 }),
        description: description ? description.slice(0, DEVTO_DESCRIPTION_MAX) : undefined,
      },
    };

    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `https://dev.to/api/articles/${encodeURIComponent(context.externalId!)}`
      : "https://dev.to/api/articles";

    const fetched = await publishFetch("Dev.to", endpoint, {
      method: isUpdate ? "PUT" : "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/vnd.forem.api-v1+json",
        "user-agent": "SEO-AI/1.0 (publishing)",
        "api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (!fetched.ok) return fetched;

    const response = fetched.response;
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
