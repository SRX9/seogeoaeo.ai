import { publishFetch } from "@/lib/publishing/fetch";
import { markdownToHtml } from "@/lib/publishing/markdown-html";
import type {
  PublishArticle,
  PublishContext,
  PublishResult,
  PublishingAdapter,
} from "@/lib/publishing/types";

const MAX_CREATION_CHECKS = 5;

type BeehiivPost = {
  id?: string;
  preview_url?: string;
  status?: string;
  web_url?: string;
};

function retryDelayMs(response: Response) {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (!retryAfter) return 1_000;

  const seconds = Number(retryAfter);
  const requestedDelay = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(retryAfter) - Date.now();
  return Math.min(3_000, Math.max(250, requestedDelay || 1_000));
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function verifyCreatedPost({
  apiKey,
  publicationId,
  postId,
  previewUrl,
}: {
  apiKey: string;
  publicationId: string;
  postId: string;
  previewUrl?: string;
}): Promise<PublishResult> {
  const endpoint = `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/posts/${encodeURIComponent(postId)}`;

  for (let attempt = 0; attempt < MAX_CREATION_CHECKS; attempt += 1) {
    const fetched = await publishFetch("beehiiv verification", endpoint, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!fetched.ok) {
      return {
        ok: false,
        error: fetched.error,
        externalId: postId,
        externalUrl: previewUrl,
      };
    }

    const response = fetched.response;
    if (response.status === 200) {
      const result = (await response.json()) as { data?: BeehiivPost };
      if (result.data?.status && result.data.status !== "confirmed") {
        return {
          ok: false,
          error: `beehiiv created the post with unexpected status ${result.data.status}`,
          externalId: result.data.id ?? postId,
          externalUrl: result.data.web_url ?? result.data.preview_url ?? previewUrl,
        };
      }
      return {
        ok: true,
        externalId: result.data?.id ?? postId,
        externalUrl: result.data?.web_url ?? result.data?.preview_url ?? previewUrl,
      };
    }

    const body = (await response.json().catch(() => null)) as {
      code?: string;
      error?: { code?: string; message?: string };
      errors?: Array<{ code?: string; message?: string }>;
      message?: string;
    } | null;
    const errorCode = body?.code ?? body?.error?.code ?? body?.errors?.[0]?.code;
    const errorMessage =
      body?.message ?? body?.error?.message ?? body?.errors?.[0]?.message;

    if (response.status === 404 && errorCode === "POST_CREATION_FAILED") {
      return {
        ok: false,
        error: `beehiiv background creation failed${errorMessage ? `: ${errorMessage}` : ""}`,
      };
    }
    if (response.status !== 202) {
      return {
        ok: false,
        error: `beehiiv verification returned ${response.status}${
          errorMessage ? `: ${errorMessage}` : ""
        }`,
        externalId: postId,
        externalUrl: previewUrl,
      };
    }
    if (attempt === MAX_CREATION_CHECKS - 1) {
      return {
        ok: false,
        error:
          "beehiiv accepted the post but is still processing it. Its remote ID was saved to prevent a duplicate.",
        externalId: postId,
        externalUrl: previewUrl,
      };
    }
    await wait(retryDelayMs(response));
  }

  return {
    ok: false,
    error: "beehiiv post verification did not complete",
    externalId: postId,
    externalUrl: previewUrl,
  };
}

export const beehiivAdapter: PublishingAdapter = {
  id: "beehiiv",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const apiKey = (context.secrets.beehiiv_api_key ?? context.secrets.api_key)?.trim();
    const publicationId = context.config.publicationId?.trim();
    if (!apiKey) {
      return { ok: false, error: "beehiiv API key is not configured" };
    }
    if (!publicationId) {
      return { ok: false, error: "beehiiv publication ID is not configured" };
    }

    const isUpdate = Boolean(context.externalId);
    const endpoint = isUpdate
      ? `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/posts/${encodeURIComponent(context.externalId!)}`
      : `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/posts`;
    const payload = {
      title: article.title,
      subtitle: article.metaDescription ?? undefined,
      body_content: markdownToHtml(article.bodyMarkdown),
      content_tags: article.tags,
      web_settings: { slug: article.slug },
      seo_settings: {
        default_title: article.title,
        default_description: article.metaDescription ?? undefined,
      },
      ...(!isUpdate ? { status: "confirmed" as const } : {}),
    };
    const fetched = await publishFetch("beehiiv", endpoint, {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!fetched.ok) return fetched;

    const response = fetched.response;
    if (!response.ok || response.status === 202) {
      const text = await response.text();
      return {
        ok: false,
        error: `beehiiv returned ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const result = (await response.json()) as { data?: BeehiivPost };
    const post = result.data;
    if (!post?.id && !context.externalId) {
      return { ok: false, error: "beehiiv did not return a post ID" };
    }

    if (!isUpdate) {
      return verifyCreatedPost({
        apiKey,
        publicationId,
        postId: post!.id!,
        previewUrl: post?.preview_url,
      });
    }

    return {
      ok: true,
      externalId: post?.id ?? context.externalId ?? undefined,
      externalUrl:
        post?.web_url ??
        post?.preview_url ??
        context.externalUrl ??
        undefined,
    };
  },
};
