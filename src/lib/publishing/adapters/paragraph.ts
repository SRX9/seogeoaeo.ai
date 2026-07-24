import { publishFetch } from "@/lib/publishing/fetch";
import type {
  PublishArticle,
  PublishContext,
  PublishResult,
  PublishingAdapter,
} from "@/lib/publishing/types";

const PARAGRAPH_API = "https://public.api.paragraph.com/api/v1";

function paragraphHeaders(apiKey: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

function paragraphPublicUrl(siteUrl: string | undefined, slug: string) {
  if (!siteUrl) return undefined;
  return `${siteUrl.replace(/\/+$/, "")}/${encodeURIComponent(slug)}`;
}

export const paragraphAdapter: PublishingAdapter = {
  id: "paragraph",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const apiKey = (
      context.secrets.paragraph_api_key ?? context.secrets.api_key
    )?.trim();
    if (!apiKey) {
      return { ok: false, error: "Paragraph API key is not configured" };
    }

    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `${PARAGRAPH_API}/posts/${encodeURIComponent(context.externalId!)}`
      : `${PARAGRAPH_API}/posts`;
    const fetched = await publishFetch("Paragraph", endpoint, {
      method: isUpdate ? "PUT" : "POST",
      headers: paragraphHeaders(apiKey),
      body: JSON.stringify({
        title: article.title.slice(0, 200),
        markdown: article.bodyMarkdown,
        subtitle: article.metaDescription?.slice(0, 300) ?? undefined,
        postPreview: article.metaDescription?.slice(0, 500) ?? undefined,
        slug: article.slug,
        categories: article.tags,
        ...(isUpdate ? { status: "published" as const } : {}),
        sendNewsletter: false,
      }),
    });
    if (!fetched.ok) return fetched;

    const response = fetched.response;
    const result = (await response.json().catch(() => null)) as {
      id?: string;
      status?: "published" | "draft" | "scheduled";
      success?: boolean;
      message?: string;
      msg?: string;
      error?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: `Paragraph returned ${response.status}: ${
          result?.msg ?? result?.message ?? result?.error ?? "request failed"
        }`,
      };
    }
    if (isUpdate && result?.success !== true) {
      return { ok: false, error: "Paragraph did not confirm the post update" };
    }
    if (!isUpdate && result?.status && result.status !== "published") {
      return { ok: false, error: `Paragraph created the post as ${result.status}` };
    }

    const externalId = result?.id ?? context.externalId ?? undefined;
    if (!externalId) {
      return { ok: false, error: "Paragraph did not return a post ID" };
    }

    return {
      ok: true,
      externalId,
      externalUrl:
        paragraphPublicUrl(context.config.siteUrl, article.slug) ??
        context.externalUrl ??
        undefined,
    };
  },
};
