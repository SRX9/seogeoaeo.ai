"use client";

import { Tabs } from "@heroui/react";
import { ManualTopicForm, TopicQueue } from "@/components/articles/topics-panel";
import { ResearchPanel } from "@/components/research/research-panel";
import { PageHeader } from "@/components/layout/page-header";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useDashboard, useMe } from "@/lib/api/queries";

export default function TopicsPage() {
  const me = useMe();
  const dashboard = useDashboard();

  if (me.isLoading || dashboard.isLoading) {
    return <PageLoader label="Loading topics…" />;
  }
  if (dashboard.error || !dashboard.data) {
    return <PageError error={dashboard.error} onRetry={() => dashboard.refetch()} />;
  }

  const { active, canGenerate, credits, creditCosts } = dashboard.data;
  const articleCost = creditCosts.article_generation;
  const showFreeHint = !active && canGenerate;
  const llmReady = me.data?.llmReady ?? true;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Topics"
        description="Research-ranked backlog and manual topics for article generation."
        meta={
          !llmReady ? (
            <p className="text-sm text-warning">
              LLM env vars are not configured. Research scoring and article generation need
              LLM_BASE_URL, LLM_API_KEY, and model IDs.
            </p>
          ) : null
        }
      />

      {showFreeHint ? (
        <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-4">
          <p className="text-sm font-medium text-foreground">
            You have {credits.total.toLocaleString()} credits to spend
          </p>
          <p className="mt-0.5 text-sm text-muted">
            Each article costs {articleCost} credits. Pick a topic in the queue and hit Generate —
            subscribe later to unlock auto-publishing.
          </p>
        </div>
      ) : null}

      <Tabs defaultSelectedKey="research">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Topic tools" className="w-fit">
            <Tabs.Tab id="research" className="whitespace-nowrap">
              Topic research
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="manual" className="whitespace-nowrap">
              <Tabs.Separator />
              Manual topic
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="queue" className="whitespace-nowrap">
              <Tabs.Separator />
              Topic queue
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id="research">
          <ResearchPanel />
        </Tabs.Panel>
        <Tabs.Panel id="manual">
          <ManualTopicForm />
        </Tabs.Panel>
        <Tabs.Panel id="queue">
          <TopicQueue canGenerate={canGenerate} articleCost={articleCost} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
