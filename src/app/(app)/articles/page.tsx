"use client";

import { ArticlesList } from "@/components/articles/articles-list";
import { PageHeader } from "@/components/layout/page-header";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useArticles } from "@/lib/api/queries";

export default function ArticlesPage() {
  const { data, isLoading, error, refetch } = useArticles();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Articles"
        description="Generated drafts, edits, and publication status."
      />
      {isLoading ? (
        <PageLoader label="Loading articles…" />
      ) : error || !data ? (
        <PageError error={error} onRetry={() => refetch()} />
      ) : (
        <ArticlesList articles={data.articles} />
      )}
    </div>
  );
}
