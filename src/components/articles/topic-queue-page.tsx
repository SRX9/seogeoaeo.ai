"use client";

import {
  Alert,
  Button,
  Card,
  ProgressBar,
  Skeleton,
  Tooltip,
  toast,
} from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState, Segment } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ManualTopicForm } from "@/components/articles/topics-panel";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { ActivityIcon, ArticlesIcon, ChevronRightIcon, PenIcon, ResearchIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  useCredits,
  useMe,
  useSetupInProgress,
  useTopics,
  type Topic,
} from "@/lib/api/queries";

type ViewMode = "research" | "manual" | "queue";

type TopicEvidence = {
  source?: string;
  sourceType?: string;
  evidenceUrls?: string[];
  query?: string;
};

const SOURCE_LABELS: Record<string, string> = {
  use_case: "Customer Profile",
  competitor_gap: "Competitor Gap",
  gsc: "Search Console",
  gsc_query: "Search Console",
  web_search: "Web Search",
  trend_query: "Trending Query",
  keyword_api: "Keyword Research",
  rss: "Competitor Feed",
  sitemap: "Competitor Site",
};

const INTENT_LABELS: Record<string, string> = {
  bofu: "Help buyers make a confident decision.",
  mofu: "Help readers compare approaches and narrow their options.",
  tofu: "Answer the core question clearly and build early trust.",
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

function evidenceCopy(topic: Topic) {
  const evidence = parseEvidence(topic);
  const sourceType = evidence.sourceType;
  const sourceLabel = sourceType
    ? (SOURCE_LABELS[sourceType] ?? evidence.source ?? "Research Signal")
    : topic.source === "manual"
      ? "Manual Topic"
      : "Research Signal";
  const sourceCount = Array.isArray(evidence.evidenceUrls) ? evidence.evidenceUrls.length : 0;

  if (sourceType === "gsc_query" || sourceType === "gsc") {
    return { title: evidence.query || "Search demand confirmed", detail: sourceLabel };
  }
  if (sourceType === "competitor_gap") {
    return {
      title: sourceCount > 0 ? `${sourceCount} competitor source${sourceCount === 1 ? "" : "s"}` : "Coverage gap found",
      detail: sourceLabel,
    };
  }
  if (sourceType === "trend_query") return { title: evidence.query || "Rising search interest", detail: sourceLabel };
  if (sourceType === "web_search") {
    return {
      title: sourceCount > 0 ? `${sourceCount} supporting source${sourceCount === 1 ? "" : "s"}` : "Search opportunity found",
      detail: sourceLabel,
    };
  }
  if (sourceType === "use_case") return { title: "Customer need identified", detail: sourceLabel };
  if (sourceType === "keyword_api") return { title: evidence.query || "Keyword opportunity", detail: sourceLabel };
  if (sourceType === "rss" || sourceType === "sitemap") return { title: evidence.source || "New competitor coverage", detail: sourceLabel };
  return {
    title: topic.source === "manual" ? "Added by your team" : evidence.source || "Opportunity identified",
    detail: sourceLabel,
  };
}

function confidenceLabel(score: number | null) {
  if (score == null) return "Unscored";
  if (score >= 70) return "High Confidence";
  if (score >= 55) return "Medium Confidence";
  return "Low Confidence";
}

function confidenceColor(score: number | null) {
  if (score == null) return "default" as const;
  if (score >= 70) return "success" as const;
  if (score >= 55) return "warning" as const;
  return "danger" as const;
}

function topicDescription(topic: Topic) {
  return topic.rationale ?? topic.angle ?? topic.answerFit ?? topic.thesis ?? "Ready for Claudia to develop.";
}

function topicIntent(topic: Topic) {
  return topic.angle ?? (topic.intentTier ? INTENT_LABELS[topic.intentTier] : null) ?? topic.rationale ?? "Clarify the reader's question and the outcome they need.";
}

function topicThesis(topic: Topic) {
  return topic.thesis ?? topic.answerFit ?? topic.rationale ?? "Build a focused answer around the strongest evidence signal for this opportunity.";
}

function TopicSkeleton() {
  return (
    <div className="grid gap-4" aria-label="Loading topic opportunities">
      {[0, 1, 2].map((item) => (
        <Card key={item} className="gap-4">
          <Card.Header className="flex-row items-start gap-4">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-3/4 rounded-lg" />
              <Skeleton className="h-4 w-full rounded-lg" />
            </div>
          </Card.Header>
          <Card.Content className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

function EmptyTopics({ mode, onResearch }: { mode: ViewMode; onResearch: () => void }) {
  return (
    <Card>
      <EmptyState>
        <EmptyState.Header>
          <EmptyState.Media variant="icon">{mode === "queue" ? <ArticlesIcon /> : <ActivityIcon />}</EmptyState.Media>
          <EmptyState.Title>{mode === "queue" ? "Your Queue Is Clear" : "No Opportunities Yet"}</EmptyState.Title>
          <EmptyState.Description>
            {mode === "queue"
              ? "Run research to find and rank the next topics worth writing."
              : "Scan search demand, competitor gaps, and customer needs for the next best topics."}
          </EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.Content>
          <Button size="sm" onPress={onResearch}><ResearchIcon className="size-4" />Run Research</Button>
        </EmptyState.Content>
      </EmptyState>
    </Card>
  );
}

function TopicCards({
  topics,
  articleCost,
  canGenerate,
  busyTopicId,
  setupInProgress,
  onQueue,
}: {
  topics: Topic[];
  articleCost: number;
  canGenerate: boolean;
  busyTopicId: string | null;
  setupInProgress: boolean;
  onQueue: (topicId: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(() => topics[0]?.id ?? null);

  return (
    <section className="grid gap-4" aria-label="Ranked topic opportunities">
      {topics.map((topic, index) => {
        const expanded = expandedId === topic.id;
        const evidence = evidenceCopy(topic);
        const busy = busyTopicId === topic.id;
        const alreadyQueued = topic.status === "generating";
        const disabled = busyTopicId !== null || setupInProgress || alreadyQueued;
        const score = topic.score == null ? null : Math.max(0, Math.min(100, Math.round(topic.score)));

        return (
          <Card key={topic.id} variant={expanded ? "tertiary" : "default"} className="gap-5">
            <Card.Header className="flex-row items-start gap-4">
              <span className="shrink-0 text-sm font-semibold text-accent tabular-nums">#{index + 1}</span>
              <div className="min-w-0 flex-1">
                <Card.Title className="text-base sm:text-lg">{topic.title}</Card.Title>
                <Card.Description className="mt-1 line-clamp-2">{topicDescription(topic)}</Card.Description>
              </div>
              <Tooltip delay={300}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${topic.title}`}
                  aria-expanded={expanded}
                  onPress={() => setExpandedId((current) => current === topic.id ? null : topic.id)}
                >
                  <ChevronRightIcon className={`size-4 ${expanded ? "rotate-90" : ""}`} />
                </Button>
                <Tooltip.Content>{expanded ? "Hide Brief" : "View Brief"}</Tooltip.Content>
              </Tooltip>
            </Card.Header>

            <Card.Content className="grid gap-4 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">Evidence</p>
                <p className="mt-1 truncate text-sm font-medium text-foreground">{evidence.title}</p>
                <p className="mt-0.5 text-xs text-muted">{evidence.detail}</p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted">Confidence</p>
                  <span className="text-xs tabular-nums text-muted">{score == null ? "—" : `${score}/100`}</span>
                </div>
                <ProgressBar value={score ?? 0} size="sm" color={confidenceColor(score)} aria-label={`${confidenceLabel(score)} score`} className="mt-2">
                  <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
                </ProgressBar>
                <p className="mt-1.5 text-xs text-muted">{confidenceLabel(score)}</p>
              </div>
              <div className="flex items-end justify-between gap-3 sm:justify-end">
                <span className="text-xs font-medium text-muted tabular-nums">{articleCost} credits</span>
                {canGenerate ? (
                  <Button
                    size="sm"
                    isDisabled={disabled}
                    isPending={busy}
                    onPress={() => onQueue(topic.id)}
                    aria-label={`Generate ${topic.title}, ${articleCost} credits`}
                  >
                    <ResearchIcon className="size-4" />
                    {busy ? "Queuing" : alreadyQueued ? "Queued" : "Generate"}
                  </Button>
                ) : (
                  <Link href="/account?tab=billing&upgrade=1" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Get Credits
                  </Link>
                )}
              </div>
            </Card.Content>

            {expanded ? (
              <Card.Footer className="grid gap-4 border-t border-separator/60 pt-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted">Reader Intent</p>
                  <p className="mt-1.5 text-sm leading-6 text-foreground">{topicIntent(topic)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted">Content Thesis</p>
                  <p className="mt-1.5 text-sm leading-6 text-foreground">{topicThesis(topic)}</p>
                </div>
              </Card.Footer>
            ) : null}
          </Card>
        );
      })}
    </section>
  );
}

export function TopicQueuePage() {
  const [mode, setMode] = useState<ViewMode>("research");
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const topicsQuery = useTopics();
  const creditsQuery = useCredits();
  const me = useMe();
  const setupInProgress = useSetupInProgress();
  const topics = topicsQuery.data?.topics ?? [];
  const articleCost = creditsQuery.data?.costs.article_generation ?? 0;
  const researchCost = creditsQuery.data?.costs.research_run ?? 0;
  const availableCredits = creditsQuery.data?.balance.total ?? 0;
  const canGenerate = articleCost > 0 && availableCredits >= articleCost;

  let visibleTopics: Topic[] = [];
  if (mode === "research") {
    const researched = topics.filter((topic) => topic.source === "research" && ["pending", "failed"].includes(topic.status));
    visibleTopics = researched.length > 0 ? researched : topics.filter((topic) => ["pending", "failed"].includes(topic.status));
  } else if (mode === "queue") {
    visibleTopics = topics.filter((topic) => ["pending", "failed", "generating"].includes(topic.status));
  }

  const research = useMutation({
    mutationFn: () => apiPost("/api/research"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.research });
      queryClient.invalidateQueries({ queryKey: queryKeys.topics });
      queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      setMode("research");
      toast.success("Research finished. Your topic queue is ready.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 402) {
        router.push("/account?tab=billing&upgrade=1");
        return;
      }
      toast.danger(getErrorMessage(error, "Research failed. Try again."));
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
        router.push("/account?tab=billing&upgrade=1");
        return;
      }
      toast.danger(getErrorMessage(error, "Could not queue this topic."));
    },
  });

  const runResearch = () => research.mutate();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Topic Queue"
        description="Research-backed opportunities ranked by their potential to improve visibility."
        actions={
          <Button
            isDisabled={research.isPending || setupInProgress}
            isPending={research.isPending}
            onPress={runResearch}
            aria-label={`Run research${researchCost > 0 ? `, ${researchCost} credits` : ""}`}
          >
            <ResearchIcon className="size-4" />
            {research.isPending ? "Researching" : "Run Research"}
          </Button>
        }
        meta={
          <>
            <span className="text-sm font-medium text-success tabular-nums">{availableCredits} credits available</span>
            {researchCost > 0 ? <span className="text-sm text-muted tabular-nums">Research costs {researchCost}</span> : null}
          </>
        }
      />

      {!me.data?.llmReady && me.data ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>AI Provider Required</Alert.Title>
            <Alert.Description>Connect an AI provider to research and score new opportunities.</Alert.Description>
          </Alert.Content>
          <Link href="/settings?tab=integrations" className={buttonVariants({ variant: "outline", size: "sm" })}>Connect Provider</Link>
        </Alert>
      ) : null}

      <div className="overflow-x-auto pb-1">
        <Segment
          className="min-w-max"
          aria-label="Topic queue views"
          selectedKey={mode}
          onSelectionChange={(key) => setMode(String(key) as ViewMode)}
        >
          <Segment.Item id="research"><ActivityIcon className="size-4" />Research</Segment.Item>
          <Segment.Item id="manual"><PenIcon className="size-4" />Manual</Segment.Item>
          <Segment.Item id="queue"><ArticlesIcon className="size-4" />Queue</Segment.Item>
        </Segment>
      </div>

      {mode === "manual" ? (
        <ManualTopicForm />
      ) : topicsQuery.isLoading || creditsQuery.isLoading ? (
        <TopicSkeleton />
      ) : visibleTopics.length === 0 ? (
        <EmptyTopics mode={mode} onResearch={runResearch} />
      ) : (
        <TopicCards
          topics={visibleTopics}
          articleCost={articleCost}
          canGenerate={canGenerate}
          busyTopicId={generate.isPending ? (generate.variables ?? null) : null}
          setupInProgress={setupInProgress}
          onQueue={(topicId) => generate.mutate(topicId)}
        />
      )}

      {topicsQuery.isError ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Topics Couldn&apos;t Load</Alert.Title>
            <Alert.Description>Refresh the page to try loading your opportunities again.</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </main>
  );
}
