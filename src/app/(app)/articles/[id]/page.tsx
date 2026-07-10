"use client";

import { useParams } from "next/navigation";
import { ArticleEditor } from "@/components/articles/article-editor";
import { PageError, PageLoader } from "@/components/feedback/states";
import { isActiveSubscription } from "@/lib/billing/plans";
import { useArticle, useMe } from "@/lib/api/queries";

export default function ArticlePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useMe();
  const { data, isLoading, error, refetch, isPlaceholderData } = useArticle(id);

  // keepPreviousData keeps the prior article visible while the next loads — treat
  // that as loading so we never mount the editor with A under B's route id.
  if (isLoading || isPlaceholderData || me.isLoading) {
    return <PageLoader label="Loading article…" />;
  }
  if (error || !data) {
    return <PageError error={error} onRetry={() => refetch()} />;
  }

  const canPublish = isActiveSubscription(me.data?.subscription?.status);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-7">
      <div>
        <h1 className="type-title text-2xl text-foreground">Edit article</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Edit the content and SEO fields, then save as a draft or approve &amp; publish.
        </p>
      </div>
      {/* key forces a full remount when navigating A → B on the same dynamic route */}
      <ArticleEditor
        key={data.article.id}
        article={data.article}
        canPublish={canPublish}
        publications={data.publications}
      />
    </div>
  );
}
