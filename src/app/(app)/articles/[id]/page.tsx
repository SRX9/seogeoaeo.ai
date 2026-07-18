"use client";

import { useParams } from "next/navigation";
import { ArticleEditor } from "@/components/articles/article-editor";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useArticle, useIntegrations, useMe, useTopics } from "@/lib/api/queries";
import { isActiveSubscription } from "@/lib/billing/plans";

export default function ArticlePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useMe();
  const { data, isLoading, error, refetch, isPlaceholderData } = useArticle(id);
  const topics = useTopics();
  const integrations = useIntegrations();

  // keepPreviousData keeps the prior article visible while the next loads. Do
  // not mount that prior record under a new article route.
  if (isLoading || isPlaceholderData || me.isLoading) {
    return <PageLoader label="Loading article…" />;
  }
  if (error || !data) {
    return <PageError error={error} onRetry={() => refetch()} />;
  }

  const canPublish = isActiveSubscription(me.data?.subscription?.status);
  const topic = topics.data?.topics.find((item) => item.id === data.article.topicId) ?? null;
  const publishingDestinations =
    integrations.data?.integrations.filter(
      (integration) =>
        integration.enabled &&
        (integration.publishMode === "article" ||
          integration.publishMode === "webhook" ||
          integration.publishMode === "export"),
    ) ?? [];

  return (
    <ArticleEditor
      key={data.article.id}
      article={data.article}
      canPublish={canPublish}
      integrations={publishingDestinations}
      publications={data.publications}
      topic={topic}
    />
  );
}
