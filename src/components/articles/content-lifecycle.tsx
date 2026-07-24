"use client";

import { Card, Tabs, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import posthog from "posthog-js";
import { ArrowRightIcon, ArticlesIcon, ResearchIcon } from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, type Article, type Topic } from "@/lib/api/queries";
import { cn } from "@/lib/cn";

export type ContentView = "ideas" | "drafts" | "completed";

type ContentLifecycleProps = {
  articles: Article[];
  topics: Topic[];
  selectedView: ContentView;
  onViewChange: (view: ContentView) => void;
};

const COMPLETED_STATUSES = new Set(["approved", "scheduled", "published", "completed"]);

function whyIdeaMatters(topic: Topic) {
  return (
    topic.rationale ??
    topic.thesis ??
    topic.angle ??
    "Claudia found a relevant question your brand can answer more completely."
  );
}

function audienceFor(topic: Topic) {
  if (topic.intentTier === "high") return "People close to choosing a solution";
  if (topic.intentTier === "medium") return "People comparing approaches";
  return "People researching this problem";
}

function formatFor(topic: Topic) {
  const value = topic.answerFit?.toLowerCase() ?? "";
  if (value.includes("faq")) return "FAQ or answer page";
  if (value.includes("comparison")) return "Comparison guide";
  if (value.includes("how") || value.includes("tutorial")) return "How-to guide";
  return "In-depth article";
}

function articleStatus(article: Article) {
  if (article.publication?.status === "published" || article.status === "published") {
    return "Published";
  }
  if (article.status === "scheduled") return "Prepared and scheduled";
  if (article.status === "approved" || article.status === "completed") return "Prepared and ready";
  if (article.status === "draft") return "Draft ready for review";
  return "Claudia is preparing the draft";
}

function EmptyLifecycle({ view }: { view: ContentView }) {
  const copy = {
    ideas: {
      title: "Claudia is researching your next idea",
      description: "The strongest customer and discovery opportunities will appear here.",
    },
    drafts: {
      title: "No drafts are waiting",
      description: "Choose an idea and Claudia will prepare the first draft.",
    },
    completed: {
      title: "Completed content will collect here",
      description: "Approved, scheduled, and published work stays available for export or review.",
    },
  }[view];

  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <ArticlesIcon className="size-8 text-muted" />
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">{copy.title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted text-pretty">{copy.description}</p>
    </div>
  );
}

function ArticleRow({ article, completed }: { article: Article; completed: boolean }) {
  return (
    <article className="grid gap-5 border-t border-separator px-5 py-6 first:border-t-0 sm:px-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className={cn("text-xs font-medium", completed ? "text-success" : "text-muted")}>
          {articleStatus(article)}
        </p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground text-pretty">
          {article.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {completed
            ? "The prepared content remains available for publishing, export, or later improvement."
            : "Open the draft to review Claudia's prepared content and finish it."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {completed ? (
          <Link
            href={`/api/articles/${article.id}/export`}
            onClick={() => posthog.capture("content_export_started", { article_id: article.id })}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "min-h-10 transition-transform active:scale-[0.96]",
            )}
          >
            Export
          </Link>
        ) : null}
        <Link
          href={`/articles/${article.id}`}
          className={cn(
            buttonVariants({ size: "sm", variant: completed ? "ghost" : "primary" }),
            "min-h-10 gap-2 transition-transform active:scale-[0.96]",
          )}
        >
          {completed ? "Open content" : "Review draft"}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export function ContentLifecycle({
  articles,
  topics,
  selectedView,
  onViewChange,
}: ContentLifecycleProps) {
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const articleTopicIds = new Set(
    articles.flatMap((article) => (article.topicId ? [article.topicId] : [])),
  );
  const ideas = topics.filter(
    (topic) =>
      !articleTopicIds.has(topic.id) &&
      topic.status !== "invalidated" &&
      topic.status !== "generating",
  );
  const generatingIdeas = topics.filter(
    (topic) => !articleTopicIds.has(topic.id) && topic.status === "generating",
  );
  const drafts = articles.filter((article) => !COMPLETED_STATUSES.has(article.status));
  const completed = articles.filter((article) => COMPLETED_STATUSES.has(article.status));
  const createContent = useMutation({
    mutationFn: (topicId: string) =>
      apiPost<{ articleId: string }>("/api/articles/generate", { topicId }),
    onMutate: (topicId) => {
      posthog.capture("content_opportunity_accepted", { topic_id: topicId });
    },
    onSuccess: (result, topicId) => {
      posthog.capture("content_draft_created", {
        topic_id: topicId,
        article_id: result.articleId,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles });
      void queryClient.invalidateQueries({ queryKey: queryKeys.topics });
      router.push(`/articles/${result.articleId}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 402) {
        router.push("/settings?tab=billing&upgrade=1");
        return;
      }
      toast.danger(getErrorMessage(error, "Couldn't create this content."));
    },
  });

  return (
    <Tabs
      variant="secondary"
      selectedKey={selectedView}
      onSelectionChange={(key) => onViewChange(String(key) as ContentView)}
    >
      <Tabs.ListContainer className="w-fit max-w-full">
        <Tabs.List
          aria-label="Content lifecycle"
          className="w-fit min-w-0 *:min-w-24 *:w-auto *:px-5"
        >
          <Tabs.Tab id="ideas">
            Ideas
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="drafts">
            Drafts
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="completed">
            Completed
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

      <Tabs.Panel id="ideas" className="pt-6">
        {selectedView === "ideas" ? (
          ideas.length > 0 ? (
            <div className="space-y-5">
              {ideas.map((topic, index) => (
                <Card key={topic.id} className="overflow-hidden rounded-3xl p-0">
                  <Card.Content className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,0.34fr)] lg:items-end">
                    <div>
                      <div className="flex items-center gap-3 text-muted">
                        <ResearchIcon className="size-5" aria-hidden />
                        <p className="text-sm font-medium">
                          {index === 0 ? "Claudia's recommendation" : "Researched opportunity"}
                        </p>
                      </div>
                      <h2 className="type-display mt-5 max-w-[28ch] text-balance text-3xl leading-[1.08] tracking-[-0.025em] text-foreground sm:text-4xl">
                        {topic.title}
                      </h2>
                      <p className="mt-4 max-w-[65ch] text-base leading-7 text-muted text-pretty">
                        {whyIdeaMatters(topic)}
                      </p>
                      <dl className="mt-7 grid gap-5 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-medium text-muted">For</dt>
                          <dd className="mt-1 text-sm leading-6 text-foreground">{audienceFor(topic)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-muted">Recommended format</dt>
                          <dd className="mt-1 text-sm leading-6 text-foreground">{formatFor(topic)}</dd>
                        </div>
                      </dl>
                    </div>
                    <LoadingButton
                      className="min-h-11 w-full transition-transform active:scale-[0.96]"
                      isPending={createContent.isPending && createContent.variables === topic.id}
                      isDisabled={createContent.isPending}
                      onPress={() => createContent.mutate(topic.id)}
                    >
                      Create content
                    </LoadingButton>
                  </Card.Content>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-3xl p-0"><EmptyLifecycle view="ideas" /></Card>
          )
        ) : null}
      </Tabs.Panel>

      <Tabs.Panel id="drafts" className="pt-6">
        {selectedView === "drafts" ? (
          drafts.length > 0 || generatingIdeas.length > 0 ? (
            <Card className="overflow-hidden rounded-3xl p-0">
              {generatingIdeas.map((topic) => (
                <article key={topic.id} className="border-t border-separator px-5 py-6 first:border-t-0 sm:px-7">
                  <p className="text-xs font-medium text-accent">Claudia is preparing the draft</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{topic.title}</h2>
                </article>
              ))}
              {drafts.map((article) => <ArticleRow key={article.id} article={article} completed={false} />)}
            </Card>
          ) : (
            <Card className="rounded-3xl p-0"><EmptyLifecycle view="drafts" /></Card>
          )
        ) : null}
      </Tabs.Panel>

      <Tabs.Panel id="completed" className="pt-6">
        {selectedView === "completed" ? (
          completed.length > 0 ? (
            <Card className="overflow-hidden rounded-3xl p-0">
              {completed.map((article) => <ArticleRow key={article.id} article={article} completed />)}
            </Card>
          ) : (
            <Card className="rounded-3xl p-0"><EmptyLifecycle view="completed" /></Card>
          )
        ) : null}
      </Tabs.Panel>
    </Tabs>
  );
}
