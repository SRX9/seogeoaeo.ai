"use client";

import { Alert, Button, Card, Skeleton, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ManualTopicForm } from "@/components/articles/topics-panel";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArticlesIcon,
  ResearchIcon,
} from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ToneText } from "@/components/ui/status-text";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  useCredits,
  useMe,
  useSetupInProgress,
  useTopics,
  type Topic,
} from "@/lib/api/queries";
import { cn } from "@/lib/cn";

type TopicEvidence = {
  source?: string;
  sourceType?: string;
  evidenceUrls?: string[];
  query?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  use_case: "a customer need",
  competitor_gap: "a competitor coverage gap",
  gsc: "Search Console demand",
  gsc_query: "Search Console demand",
  web_search: "current search results",
  trend_query: "rising search interest",
  keyword_api: "keyword research",
  rss: "new competitor coverage",
  sitemap: "competitor site coverage",
};

function parseEvidence(topic: Topic): TopicEvidence {
  if (!topic.evidenceJson) return {};
  try {
    const value = JSON.parse(topic.evidenceJson) as TopicEvidence;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function whyThisIdea(topic: Topic) {
  if (topic.rationale) return topic.rationale;
  if (topic.angle) return topic.angle;
  if (topic.answerFit) return topic.answerFit;

  const evidence = parseEvidence(topic);
  const source = evidence.sourceType ? SOURCE_LABELS[evidence.sourceType] : null;
  if (source && evidence.query) return `Claudia found ${source} around “${evidence.query}”.`;
  if (source) return `Claudia found this idea through ${source}.`;
  if (topic.source === "manual") return "Your team added this idea for Claudia to consider.";
  return "Claudia found this while comparing customer questions, demand, and competitor coverage.";
}

function topicState(topic: Topic) {
  if (topic.status === "generating") return { label: "Claudia is writing this", tone: "accent" as const };
  if (topic.status === "failed") return { label: "Claudia will reconsider this", tone: "danger" as const };
  return { label: "Ready", tone: "success" as const };
}

function IdeasSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading content ideas">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="rounded-3xl p-5 sm:p-6">
          <Skeleton className="h-5 w-2/3 rounded-lg" />
          <Skeleton className="mt-3 h-4 w-full rounded-lg" />
          <Skeleton className="mt-2 h-4 w-4/5 rounded-lg" />
        </Card>
      ))}
    </div>
  );
}

function IdeaCard({
  topic,
  canGenerate,
  isBusy,
  isDisabled,
  onWrite,
}: {
  topic: Topic;
  canGenerate: boolean;
  isBusy: boolean;
  isDisabled: boolean;
  onWrite: () => void;
}) {
  const state = topicState(topic);
  const isWriting = topic.status === "generating";

  return (
    <Card className="rounded-3xl p-0">
      <Card.Content className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <ToneText tone={state.tone} className="text-xs">{state.label}</ToneText>
          <h2 className="mt-1 text-base font-semibold leading-6 text-foreground sm:text-lg">{topic.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{whyThisIdea(topic)}</p>
        </div>
        {!isWriting ? (
          canGenerate ? (
            <Button
              variant="outline"
              className="min-h-11 shrink-0 transition-transform active:scale-[0.96]"
              isDisabled={isDisabled}
              isPending={isBusy}
              onPress={onWrite}
            >
              <ArticlesIcon className="size-4" aria-hidden />
              {isBusy ? "Starting" : "Ask Claudia to write this"}
            </Button>
          ) : (
            <Link
              href="/settings?tab=billing&upgrade=1"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "min-h-11 shrink-0 transition-transform active:scale-[0.96]",
              )}
            >
              Add work capacity
            </Link>
          )
        ) : null}
      </Card.Content>
    </Card>
  );
}

export function TopicQueuePage() {
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const topicsQuery = useTopics();
  const creditsQuery = useCredits();
  const me = useMe();
  const setupInProgress = useSetupInProgress();
  const topics = (topicsQuery.data?.topics ?? []).filter((topic) =>
    ["pending", "failed", "generating"].includes(topic.status),
  );
  const articleCost = creditsQuery.data?.costs.article_generation ?? 0;
  const researchCost = creditsQuery.data?.costs.research_run ?? 0;
  const availableCredits = creditsQuery.data?.balance.total ?? 0;
  const canGenerate = articleCost === 0 || availableCredits >= articleCost;

  const research = useMutation({
    mutationFn: () => apiPost("/api/research"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research });
      queryClient.invalidateQueries({ queryKey: queryKeys.topics });
      queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      toast.success("Claudia found new content ideas.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 402) {
        router.push("/settings?tab=billing&upgrade=1");
        return;
      }
      toast.danger(getErrorMessage(error, "Claudia couldn't complete that research."));
    },
  });

  const generate = useMutation({
    mutationFn: (topicId: string) => apiPost<{ articleId: string }>("/api/articles/generate", { topicId }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics });
      queryClient.invalidateQueries({ queryKey: queryKeys.articles });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      router.push(`/articles/${result.articleId}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 402) {
        router.push("/settings?tab=billing&upgrade=1");
        return;
      }
      toast.danger(getErrorMessage(error, "Claudia couldn't start this article."));
    },
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Content ideas"
        description="Optional opportunities Claudia has found while researching demand, customer questions, and competitor gaps."
        actions={
          <Link
            href="/articles"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-11 gap-2 transition-transform active:scale-[0.96]",
            )}
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            Back to Content
          </Link>
        }
      />

      <Card className="rounded-3xl p-0">
        <Card.Content className="flex items-start gap-4 p-5 sm:p-6">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
            aria-hidden
          >
            <ResearchIcon className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Claudia finds ideas automatically</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              You do not need to manage this list. Claudia will choose strong opportunities during her normal work; use this page only when you want to guide what she writes next.
            </p>
          </div>
        </Card.Content>
      </Card>

      {!me.data?.llmReady && me.data ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Connect an AI provider</Alert.Title>
            <Alert.Description>Claudia needs a provider connection before she can research or write.</Alert.Description>
          </Alert.Content>
          <Link href="/settings?tab=integrations" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Connect provider
          </Link>
        </Alert>
      ) : null}

      {topicsQuery.isLoading || creditsQuery.isLoading ? (
        <IdeasSkeleton />
      ) : topics.length > 0 ? (
        <section className="grid gap-3" aria-label="Content ideas">
          {topics.map((topic) => (
            <IdeaCard
              key={topic.id}
              topic={topic}
              canGenerate={canGenerate}
              isBusy={generate.isPending && generate.variables === topic.id}
              isDisabled={generate.isPending || setupInProgress || topic.status === "generating"}
              onWrite={() => generate.mutate(topic.id)}
            />
          ))}
        </section>
      ) : (
        <Card className="rounded-3xl p-0">
          <Card.Content className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
            <ResearchIcon className="size-8 text-muted" aria-hidden />
            <h2 className="mt-4 text-lg font-semibold text-foreground">Claudia is researching the next ideas</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              New opportunities will appear here when Claudia finds enough evidence to recommend them.
            </p>
          </Card.Content>
        </Card>
      )}

      {topicsQuery.isError ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Ideas couldn&apos;t load</Alert.Title>
            <Alert.Description>Refresh the page to try again.</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Card className="rounded-3xl p-0">
        <Card.Content className="p-5 sm:p-6">
          <details>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus">
              Advanced actions
              <ArrowRightIcon className="size-4 text-muted" aria-hidden />
            </summary>
            <div className="space-y-5 border-t border-separator pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Run extra research now</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    {researchCost > 0
                      ? `Uses ${researchCost} credits. ${availableCredits} credits are available.`
                      : "Claudia normally researches automatically on her schedule."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="min-h-11 shrink-0 transition-transform active:scale-[0.96]"
                  isDisabled={research.isPending || setupInProgress}
                  isPending={research.isPending}
                  onPress={() => research.mutate()}
                >
                  <ResearchIcon className="size-4" aria-hidden />
                  {research.isPending ? "Researching" : "Run extra research"}
                </Button>
              </div>
              <ManualTopicForm />
            </div>
          </details>
        </Card.Content>
      </Card>
    </main>
  );
}
