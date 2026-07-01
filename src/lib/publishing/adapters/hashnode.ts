import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";

const PUBLISH_POST_MUTATION = `
  mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post {
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

    const response = await fetch("https://gql.hashnode.com", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: apiKey,
      },
      body: JSON.stringify({
        query: PUBLISH_POST_MUTATION,
        variables: {
          input: {
            title: article.title,
            contentMarkdown: article.bodyMarkdown,
            tags: article.tags.map((tag) => ({ slug: tag.toLowerCase().replace(/\s+/g, "-"), name: tag })),
            publicationId,
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: `Hashnode returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      data?: { publishPost?: { post?: { url?: string } } };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      return { ok: false, error: data.errors.map((error) => error.message).join("; ") };
    }

    const url = data.data?.publishPost?.post?.url;
    if (!url) {
      return { ok: false, error: "Hashnode did not return a published post URL" };
    }

    return { ok: true, externalUrl: url };
  },
};
