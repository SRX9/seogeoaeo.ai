import { publishFetch } from "@/lib/publishing/fetch";
import { normalizeNamedTags } from "@/lib/publishing/tags";
import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";

const PUBLISH_POST_MUTATION = `
  mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post {
        id
        url
      }
    }
  }
`;

const UPDATE_POST_MUTATION = `
  mutation UpdatePost($input: UpdatePostInput!) {
    updatePost(input: $input) {
      post {
        id
        url
      }
    }
  }
`;

export const hashnodeAdapter: PublishingAdapter = {
  id: "hashnode",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    const apiKey = context.secrets.hashnode_token ?? context.secrets.api_key;
    const publicationId = context.config.publicationId?.trim();

    if (!apiKey) {
      return { ok: false, error: "Hashnode personal access token is not configured" };
    }
    if (!publicationId) {
      return { ok: false, error: "Hashnode publication ID is not configured" };
    }

    const tags = normalizeNamedTags(article.tags, { max: 5 });

    const isUpdate = Boolean(context.externalId);
    const body = isUpdate
      ? {
          query: UPDATE_POST_MUTATION,
          variables: {
            input: {
              id: context.externalId,
              title: article.title,
              contentMarkdown: article.bodyMarkdown,
              tags,
            },
          },
        }
      : {
          query: PUBLISH_POST_MUTATION,
          variables: {
            input: {
              title: article.title,
              contentMarkdown: article.bodyMarkdown,
              tags,
              publicationId,
            },
          },
        };

    const fetched = await publishFetch("Hashnode", "https://gql.hashnode.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Hashnode expects the raw PAT in Authorization (not Bearer-prefixed).
        authorization: apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!fetched.ok) return fetched;

    const response = fetched.response;
    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: `Hashnode returned ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      data?: {
        publishPost?: { post?: { id?: string; url?: string } };
        updatePost?: { post?: { id?: string; url?: string } };
      };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      return { ok: false, error: data.errors.map((error) => error.message).join("; ") };
    }

    const post = isUpdate ? data.data?.updatePost?.post : data.data?.publishPost?.post;
    const url = post?.url;
    if (!url) {
      return { ok: false, error: "Hashnode did not return a published post URL" };
    }

    return {
      ok: true,
      externalUrl: url,
      externalId: post?.id ?? context.externalId ?? undefined,
    };
  },
};
