import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";

function buildPayload(article: PublishArticle) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    metaDescription: article.metaDescription,
    tags: article.tags,
    bodyMarkdown: article.bodyMarkdown,
    publishedAt: new Date().toISOString(),
  };
}

export const webhookAdapter: PublishingAdapter = {
  id: "webhook",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const webhookUrl = context.config.webhookUrl?.trim();
    if (!webhookUrl) {
      return { ok: false, error: "Webhook URL is not configured" };
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const apiKey = context.secrets.api_key;
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(buildPayload(article)),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: `Webhook returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    return { ok: true, externalUrl: webhookUrl };
  },
};
