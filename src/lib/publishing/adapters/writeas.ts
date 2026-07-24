import { publishFetch } from "@/lib/publishing/fetch";
import type {
  PublishArticle,
  PublishContext,
  PublishResult,
  PublishingAdapter,
} from "@/lib/publishing/types";

export const writeasAdapter: PublishingAdapter = {
  id: "writeas",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const accessToken = (
      context.secrets.writeas_access_token ?? context.secrets.api_key
    )?.trim();
    const collectionAlias = context.config.collectionAlias?.trim();
    if (!accessToken) {
      return { ok: false, error: "Write.as access token is not configured" };
    }
    if (!collectionAlias) {
      return { ok: false, error: "Write.as collection alias is not configured" };
    }

    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `https://write.as/api/posts/${encodeURIComponent(context.externalId!)}`
      : `https://write.as/api/collections/${encodeURIComponent(collectionAlias)}/posts`;
    const fetched = await publishFetch("Write.as", endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Token ${accessToken}`,
      },
      body: JSON.stringify({
        title: article.title,
        body: article.bodyMarkdown,
        ...(!isUpdate ? { slug: article.slug } : {}),
      }),
    });
    if (!fetched.ok) return fetched;

    const response = fetched.response;
    const result = (await response.json().catch(() => null)) as {
      data?: {
        id?: string;
        slug?: string;
        collection?: { url?: string };
      };
      error_msg?: string;
    } | null;
    if (!response.ok) {
      return {
        ok: false,
        error: `Write.as returned ${response.status}: ${
          result?.error_msg ?? "request failed"
        }`,
      };
    }

    const post = result?.data;
    const slug = post?.slug ?? article.slug;
    const collectionUrl =
      post?.collection?.url ?? `https://write.as/${encodeURIComponent(collectionAlias)}/`;
    return {
      ok: true,
      externalId: post?.id ?? context.externalId ?? undefined,
      externalUrl:
        context.externalUrl ?? `${collectionUrl.replace(/\/?$/, "/")}${encodeURIComponent(slug)}`,
    };
  },
};
