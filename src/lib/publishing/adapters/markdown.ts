import type { PublishArticle, PublishContext, PublishResult, PublishingAdapter } from "@/lib/publishing/types";

export const markdownExportAdapter: PublishingAdapter = {
  id: "markdown_export",
  async publish(article: PublishArticle, context: PublishContext): Promise<PublishResult> {
    return {
      ok: true,
      externalUrl: `${context.origin}/api/articles/${article.id}/export`,
    };
  },
};
