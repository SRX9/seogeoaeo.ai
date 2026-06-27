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
  const { data, isLoading, error, refetch } = useArticle(id);

  if (isLoading || me.isLoading) {
    return <PageLoader label="Loading article…" />;
  }
  if (error || !data) {
    return <PageError error={error} onRetry={() => refetch()} />;
  }

  const canPublish = isActiveSubscription(me.data?.subscription?.status);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Edit article</h1>
        <p className="mt-1 text-sm text-muted">
          Edit the content and SEO fields, then save as a draft or approve &amp; publish.
        </p>
      </div>
      <ArticleEditor
        article={data.article}
        canPublish={canPublish}
        publications={data.publications}
      />
    </div>
  );
}
