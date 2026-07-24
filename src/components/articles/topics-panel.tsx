"use client";

import { Card, Form, Input, Label, TextArea, Tooltip, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState, Segment } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { InlineLoader } from "@/components/feedback/inline-loader";
import { PenIcon, PlusIcon, ResearchIcon, TopicsIcon } from "@/components/icons";
import { StatusText, ToneText } from "@/components/ui/status-text";
import { LoadingButton } from "@/components/ui/loading-button";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, useSetupInProgress, useTopics, type Topic } from "@/lib/api/queries";

type TopicsCache = { topics: Topic[] };
type TopicQueueProps = { canGenerate: boolean; articleCost: number };

const filters = [
  { id: "all", label: "All" },
  { id: "research", label: "Research" },
  { id: "manual", label: "Manual" },
] as const;

const SOURCE_BADGES: Record<string, string> = {
  use_case: "Customer Profile",
  competitor_gap: "Competitor Gap",
  gsc: "Search Console",
  web_search: "Web Search",
  trend_query: "Trending",
  keyword_api: "Keyword Ideas",
  rss: "Competitor Blog",
  sitemap: "Competitor Blog",
};

const INTENT_BADGES: Record<string, string> = {
  bofu: "Buying Now",
  mofu: "Comparing Options",
  tofu: "Learning",
};

function sourceLabel(topic: Topic): string | null {
  if (!topic.evidenceJson) return null;
  try {
    const evidence = JSON.parse(topic.evidenceJson) as { sourceType?: string };
    return evidence.sourceType ? (SOURCE_BADGES[evidence.sourceType] ?? null) : null;
  } catch {
    return null;
  }
}

const EMPTY_TOPIC = { title: "", angle: "", keywords: "" };

export function ManualTopicForm() {
  const [fields, setFields] = useState(EMPTY_TOPIC);
  const set = (key: keyof typeof EMPTY_TOPIC) => (event: { target: { value: string } }) =>
    setFields((previous) => ({ ...previous, [key]: event.target.value }));

  const createTopic = useOptimisticMutation<unknown, typeof EMPTY_TOPIC, TopicsCache>({
    mutationFn: (input) => apiPost("/api/topics", input),
    queryKey: queryKeys.topics,
    optimisticUpdate: (current, input) => ({
      topics: [
        {
          id: `temp-${Date.now()}`,
          title: input.title,
          angle: input.angle || null,
          keywords: input.keywords || null,
          status: "pending",
          source: "manual",
          score: null,
          rationale: null,
          answerFit: null,
          evidenceJson: null,
          intentTier: null,
          thesis: null,
        },
        ...(current?.topics ?? []),
      ],
    }),
    invalidateKeys: [queryKeys.automation],
    onSuccess: () => {
      setFields(EMPTY_TOPIC);
      toast.success("Topic added to your queue.");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not add topic.")),
  });

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createTopic.mutate({
      title: fields.title.trim(),
      angle: fields.angle.trim(),
      keywords: fields.keywords.trim(),
    });
  }

  return (
    <Card>
      <Card.Header className="flex-row items-start gap-3">
        <div className="rounded-xl bg-accent-soft p-2 text-accent-soft-foreground"><PenIcon className="size-5" /></div>
        <div>
          <Card.Title>Create a Manual Topic</Card.Title>
          <Card.Description className="mt-1">Add a specific idea directly to the writing queue.</Card.Description>
        </div>
      </Card.Header>
      <Form aria-label="Create a manual topic" onSubmit={handleCreate}>
        <Card.Content className="grid gap-5">
          <div className="space-y-2">
            <Label htmlFor="topic-title">Topic Title</Label>
            <Input
              id="topic-title"
              name="title"
              value={fields.title}
              onChange={set("title")}
              required
              placeholder="How to automate SEO content production"
              variant="secondary"
              fullWidth
            />
            <p className="text-xs text-muted">The main question or idea the article should address.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="topic-angle">Angle</Label>
              <TextArea
                id="topic-angle"
                name="angle"
                value={fields.angle}
                onChange={set("angle")}
                rows={3}
                placeholder="Focus on founders with small teams"
                variant="secondary"
                fullWidth
              />
              <p className="text-xs text-muted">The audience, point of view, or outcome to lead with.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-keywords">Keywords</Label>
              <TextArea
                id="topic-keywords"
                name="keywords"
                value={fields.keywords}
                onChange={set("keywords")}
                rows={3}
                placeholder="seo automation, content marketing"
                variant="secondary"
                fullWidth
              />
              <p className="text-xs text-muted">Comma-separated search terms to consider.</p>
            </div>
          </div>
        </Card.Content>
        <Card.Footer className="mt-5 justify-end">
          <LoadingButton type="submit" isPending={createTopic.isPending} isDisabled={!fields.title.trim()}>
            <PlusIcon className="size-4" />
            {createTopic.isPending ? "Adding" : "Add to Queue"}
          </LoadingButton>
        </Card.Footer>
      </Form>
    </Card>
  );
}

export function TopicQueue({ canGenerate, articleCost }: TopicQueueProps) {
  const [filter, setFilter] = useState("all");
  const { data, isLoading } = useTopics();
  const topics = data?.topics ?? [];
  const visibleTopics = topics.filter((topic) => {
    if (filter === "research") return topic.source === "research";
    if (filter === "manual") return topic.source !== "research";
    return true;
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Topic Queue</h2>
          <p className="mt-1 text-sm text-muted"><span className="tabular-nums">{visibleTopics.length}</span> topics ready to review</p>
        </div>
        <Segment aria-label="Filter topics by source" size="sm" variant="ghost" selectedKey={filter} onSelectionChange={(key) => setFilter(String(key))}>
          {filters.map((item) => <Segment.Item key={item.id} id={item.id}>{item.label}</Segment.Item>)}
        </Segment>
      </div>

      {isLoading ? (
        <Card className="items-center py-4"><InlineLoader label="Loading topics" /></Card>
      ) : visibleTopics.length === 0 ? (
        <Card>
          <EmptyState size="sm">
            <EmptyState.Header>
              <EmptyState.Media variant="icon"><TopicsIcon /></EmptyState.Media>
              <EmptyState.Title>No Topics Here</EmptyState.Title>
              <EmptyState.Description>Add an idea manually or run research to build your queue.</EmptyState.Description>
            </EmptyState.Header>
          </EmptyState>
        </Card>
      ) : (
        <TopicList topics={visibleTopics} canGenerate={canGenerate} articleCost={articleCost} />
      )}
      <SourceWeightsNote weights={data?.sourceWeights} />
    </section>
  );
}

const SOURCE_WEIGHT_LABELS: Record<string, string> = {
  gsc_query: "Search Console topics",
  use_case: "customer-profile topics",
  competitor_gap: "competitor-gap topics",
  trend_query: "trend topics",
  web_search: "web-search topics",
  keyword_api: "keyword topics",
};

function SourceWeightsNote({ weights }: { weights?: Record<string, number> }) {
  if (!weights) return null;
  const learned = Object.entries(weights)
    .filter(([source, weight]) => Math.abs(weight - 1) >= 0.1 && SOURCE_WEIGHT_LABELS[source])
    .sort((a, b) => b[1] - a[1]);
  if (learned.length === 0) return null;
  const lines = learned.map(([source, weight]) => `${SOURCE_WEIGHT_LABELS[source]} ${weight.toFixed(1)}×`);
  return <p className="text-xs leading-5 text-muted">Claudia is adjusting the ranking from past performance: {lines.join(", ")}.</p>;
}

function TopicList({ topics, canGenerate, articleCost }: { topics: Topic[]; canGenerate: boolean; articleCost: number }) {
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const settingUp = useSetupInProgress();
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
      toast.danger(getErrorMessage(error, "Could not generate article."));
    },
  });

  return (
    <div className="grid gap-3">
      {topics.map((topic) => {
        const isGenerating = generate.isPending && generate.variables === topic.id;
        return (
          <Card key={topic.id} className="flex-row items-start gap-4">
            <Card.Content className="min-w-0 flex-1">
              <p className="font-medium leading-snug text-foreground">{topic.title}</p>
              {topic.thesis || topic.rationale ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted">{topic.thesis ?? topic.rationale}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <ToneText className="text-xs">{sourceLabel(topic) ?? topic.source}</ToneText>
                {topic.intentTier && INTENT_BADGES[topic.intentTier] ? <ToneText tone="accent" className="text-xs">{INTENT_BADGES[topic.intentTier]}</ToneText> : null}
                <StatusText status={topic.status} className="text-xs" />
                {topic.score != null ? <ToneText tone="accent" className="text-xs tabular-nums">Score {Math.round(topic.score)}</ToneText> : null}
              </div>
            </Card.Content>
            <div className="shrink-0">
              {canGenerate ? (
                <Tooltip delay={300}>
                  <LoadingButton
                    size="sm"
                    isIconOnly
                    aria-label={`Generate article, ${articleCost} credits`}
                    isPending={isGenerating}
                    isDisabled={generate.isPending || settingUp}
                    onPress={() => generate.mutate(topic.id)}
                  >
                    <ResearchIcon className="size-4" />
                  </LoadingButton>
                  <Tooltip.Content>{settingUp ? "Available after brand setup" : `Generate Article · ${articleCost} credits`}</Tooltip.Content>
                </Tooltip>
              ) : (
                <Link href="/account?tab=billing&upgrade=1" className={buttonVariants({ variant: "outline", size: "sm" })}>Add Capacity</Link>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
