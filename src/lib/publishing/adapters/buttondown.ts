import { publishFetch } from "@/lib/publishing/fetch";
import type {
  PublishArticle,
  PublishContext,
  PublishResult,
  PublishingAdapter,
} from "@/lib/publishing/types";

export const buttondownAdapter: PublishingAdapter = {
  id: "buttondown",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const apiKey = (
      context.secrets.buttondown_api_key ?? context.secrets.api_key
    )?.trim();
    if (!apiKey) {
      return { ok: false, error: "Buttondown API key is not configured" };
    }

    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `https://api.buttondown.com/v1/emails/${encodeURIComponent(context.externalId!)}`
      : "https://api.buttondown.com/v1/emails";
    const payload = {
      subject: article.title,
      slug: article.slug,
      body: `<!-- buttondown-editor-mode: plaintext -->\n${article.bodyMarkdown}`,
      description: article.metaDescription ?? undefined,
      email_type: "public",
      archival_mode: "enabled",
      ...(!isUpdate ? { status: "about_to_send" as const } : {}),
    };
    const fetched = await publishFetch("Buttondown", endpoint, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!fetched.ok) return fetched;

    const response = fetched.response;
    const result = (await response.json().catch(() => null)) as {
      id?: string;
      absolute_url?: string;
      detail?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: `Buttondown returned ${response.status}: ${
          result?.detail ?? "request failed"
        }`,
      };
    }

    const externalId = result?.id ?? context.externalId ?? undefined;
    if (!externalId) {
      return { ok: false, error: "Buttondown did not return an email ID" };
    }
    return {
      ok: true,
      externalId,
      externalUrl: result?.absolute_url ?? context.externalUrl ?? undefined,
    };
  },
};
