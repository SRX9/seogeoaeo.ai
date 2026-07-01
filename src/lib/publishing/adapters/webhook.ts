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

async function hmacSignature(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
    const bearerToken = context.secrets.webhook_bearer_token ?? context.secrets.api_key;
    if (bearerToken) {
      headers.authorization = `Bearer ${bearerToken}`;
    }

    const body = JSON.stringify(buildPayload(article));
    const signingSecret = context.secrets.webhook_signing_secret;
    if (signingSecret) {
      headers["x-seo-ai-signature"] = `sha256=${await hmacSignature(signingSecret, body)}`;
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body,
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
