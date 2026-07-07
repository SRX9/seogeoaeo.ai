"use client";

import { Tabs } from "@heroui/react";
import { useMemo } from "react";
import { ManualTopicForm, TopicQueue } from "@/components/articles/topics-panel";
import { ResearchPanel } from "@/components/research/research-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { combineQueries, useCredits, useMe } from "@/lib/api/queries";
import { isActiveSubscription } from "@/lib/billing/plans";

const queueSkeleton = <CardSkeleton lines={4} />;

export default function TopicsPage() {
  const me = useMe();
  const credits = useCredits();
  const hint = combineQueries(me, credits);

  // Read without gating — defaults to "ready" until /api/me resolves so the
  // warning only appears when we actually know the LLM env is unconfigured.
  const llmReady = me.data?.llmReady ?? true;
  const headerMeta = useMemo(
    () =>
      !llmReady ? (
        <p className="text-sm text-warning">
          LLM env vars are not configured. Research scoring and article generation need
          LLM_BASE_URL, LLM_API_KEY, and model IDs.
        </p>
      ) : null,
    [llmReady],
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <PageHeader
        title="Topics"
        description="Research-ranked backlog and manual topics for article generation."
        meta={headerMeta}
      />

      <Section query={hint} skeleton={null}>
        {([meData, creditsData]) => {
          const active = isActiveSubscription(meData.subscription?.status);
          const total = creditsData.balance.total;
          const articleCost = creditsData.costs.article_generation;
          const canGenerate = total >= articleCost;
          if (active || !canGenerate) return null;
          return (
            <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-4">
              <p className="text-sm font-medium text-foreground">
                You have {total.toLocaleString()} credits to spend
              </p>
              <p className="mt-0.5 text-sm text-muted">
                Each article costs {articleCost} credits. Pick a topic in the queue and hit
                Generate — subscribe later to unlock auto-publishing.
              </p>
            </div>
          );
        }}
      </Section>

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
          <Section
            query={credits}
            skeleton={queueSkeleton}
            errorLabel="Couldn't load your credits."
          >
            {(creditsData) => (
              <TopicQueue
                canGenerate={creditsData.balance.total >= creditsData.costs.article_generation}
                articleCost={creditsData.costs.article_generation}
              />
            )}
          </Section>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
