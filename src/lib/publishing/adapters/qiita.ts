import { publishFetch } from "@/lib/publishing/fetch";
import type {
  PublishArticle,
  PublishContext,
  PublishResult,
  PublishingAdapter,
} from "@/lib/publishing/types";

function qiitaTags(tags: string[]) {
  const seen = new Set<string>();
  const normalized: { name: string; versions: string[] }[] = [];

  for (const raw of tags) {
    const name = raw.trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    normalized.push({ name, versions: [] });
    if (normalized.length === 5) break;
  }

  return normalized;
}

export const qiitaAdapter: PublishingAdapter = {
  id: "qiita",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const accessToken = (
      context.secrets.qiita_access_token ?? context.secrets.api_key
    )?.trim();
    if (!accessToken) {
      return { ok: false, error: "Qiita access token is not configured" };
    }

    const tags = qiitaTags(article.tags);
    if (tags.length === 0) {
      return { ok: false, error: "Qiita requires at least one article tag" };
    }

    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `https://qiita.com/api/v2/items/${encodeURIComponent(context.externalId!)}`
      : "https://qiita.com/api/v2/items";
    const fetched = await publishFetch("Qiita", endpoint, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: article.title,
        body: article.bodyMarkdown,
        private: false,
        tags,
        ...(!isUpdate ? { tweet: false } : {}),
      }),
    });
    if (!fetched.ok) return fetched;

    const response = fetched.response;
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: `Qiita returned ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as { id?: string; url?: string };
    if (!data.url) {
      return { ok: false, error: "Qiita did not return a published item URL" };
    }

    return {
      ok: true,
      externalId: data.id ?? context.externalId ?? undefined,
      externalUrl: data.url,
    };
  },
};
