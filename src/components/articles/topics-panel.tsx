"use client";

import { buttonVariants } from "@heroui/react/button";
import { Button, Card, Input, Label, Spinner, Tooltip, toast } from "@heroui/react";
import { Segment } from "@heroui-pro/react";
import type { Key } from "react-aria-components";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EmptyState } from "@heroui-pro/react/empty-state";
import { LoadingButton } from "@/components/ui/loading-button";
import { InlineLoader } from "@/components/feedback/states";
import { PenIcon, PlusIcon, SparklesIcon, TopicsIcon } from "@/components/icons";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, useSetupInProgress, useTopics, type Topic } from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import { statusTextClass } from "@/lib/ui/status";

type TopicsCache = { topics: Topic[] };

type TopicQueueProps = {
  canGenerate: boolean;
  articleCost: number;
};

const filters = [
  { id: "all", label: "All" },
  { id: "research", label: "Research" },
  { id: "manual", label: "Manual" },
] as const;

// Owner language for where a topic idea came from — never the raw enum.
const SOURCE_BADGES: Record<string, string> = {
  use_case: "Customer profiles",
  competitor_gap: "Competitor gap",
  gsc: "Search Console",
  web_search: "Web search",
  trend_query: "Trending",
  keyword_api: "Keyword ideas",
  rss: "Competitor blog",
  sitemap: "Competitor blog",
};

// Buyer intent, in owner language: why this topic ranks where it does.
const INTENT_BADGES: Record<string, string> = {
  bofu: "Buying now",
  mofu: "Comparing options",
  tofu: "Learning",
};

/** The research source badge, read from the topic's stored evidence. */
function sourceBadge(topic: Topic): string | null {
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
  // Controlled state — HeroUI inputs don't reliably submit via native FormData.
  const [fields, setFields] = useState(EMPTY_TOPIC);

  const set =
    (key: keyof typeof EMPTY_TOPIC) =>
      (event: { target: { value: string } }) =>
        setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const createTopic = useOptimisticMutation<
    unknown,
    { title: string; angle: string; keywords: string },
    TopicsCache
  >({
    mutationFn: (input) => apiPost("/api/topics", input),
    queryKey: queryKeys.topics,
    optimisticUpdate: (current, input) => ({
      // Show the new manual topic at the top of the queue immediately; the
      // settle-invalidate swaps the temp id for the server's record.
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
      toast.success("Topic added to your queue");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not add topic")),
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
    <Card className="gap-0 p-7 sm:p-9">
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <PenIcon className="mt-1 size-5 shrink-0 text-foreground" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Create a manual topic
          </h3>
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            Already know what you want to write? Drop it straight into the queue and generate
            when you&apos;re ready.
          </p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="mt-8">
        <div className="space-y-2">
          <Label htmlFor="title" >Topic title</Label>
          <Input id="title" name="title" value={fields.title} onChange={set("title")} required placeholder="How to automate SEO blog production" variant="secondary" fullWidth />
          <p className="text-xs leading-relaxed text-muted">The headline idea — what the article is about.</p>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="angle">Angle</Label>
            <Input id="angle" name="angle" value={fields.angle} onChange={set("angle")} placeholder="Focus on founders with small teams" variant="secondary" fullWidth />
            <p className="text-xs leading-relaxed text-muted">Who it&apos;s for, or the take to lead with.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords</Label>
            <Input id="keywords" name="keywords" value={fields.keywords} onChange={set("keywords")} placeholder="seo automation, content marketing" variant="secondary" fullWidth />
            <p className="text-xs leading-relaxed text-muted">Comma-separated terms to target.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-7">
          <LoadingButton className="w-fit" type="submit" isPending={createTopic.isPending} pendingLabel="Adding…">
            <PlusIcon className="size-4" />
            Add to queue
          </LoadingButton>
          <p className="text-xs leading-relaxed text-muted">Appears at the top of your topic queue.</p>
        </div>
      </form>
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Topic queue</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted tabular-nums">{visibleTopics.length} topics</span>
          <Segment
            aria-label="Filter topics by source"
            size="sm"
            selectedKey={filter}
            onSelectionChange={(key: Key) => setFilter(String(key))}
          >
            {filters.map((item) => (
              <Segment.Item key={item.id} id={item.id}>
                <Segment.Separator />
                {item.label}
              </Segment.Item>
            ))}
          </Segment>
        </div>
      </div>

      {isLoading ? (
        <InlineLoader label="Loading topics…" />
      ) : visibleTopics.length === 0 ? (
        <EmptyState size="sm" className="rounded-xl border border-dashed border-border">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <TopicsIcon />
            </EmptyState.Media>
            <EmptyState.Title>
              {filter === "manual" ? "No manual topics yet" : "No topics in the queue"}
            </EmptyState.Title>
            <EmptyState.Description>
              {filter === "manual"
                ? "Add your own idea in the Manual topic tab and it lands here, ready to write."
                : "Run topic research and Claudia fills this queue with ranked, traffic-backed ideas."}
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      ) : (
        <TopicList topics={visibleTopics} canGenerate={canGenerate} articleCost={articleCost} />
      )}
      <SourceWeightsNote weights={data?.sourceWeights} />
    </section>
  );
}

/** Owner-language labels for C4's learned source weights. */
const SOURCE_WEIGHT_LABELS: Record<string, string> = {
  gsc_query: "Search Console topics",
  use_case: "customer-profile topics",
  competitor_gap: "competitor-gap topics",
  trend_query: "trend topics",
  web_search: "web-search topics",
  keyword_api: "keyword topics",
};

/**
 * C4 transparency: when the performance loop has learned a meaningful weight
 * for a source, say so — the backlog ranking shouldn't feel arbitrary.
 */
function SourceWeightsNote({ weights }: { weights?: Record<string, number> }) {
  if (!weights) return null;
  const learned = Object.entries(weights)
    .filter(([source, weight]) => Math.abs(weight - 1) >= 0.1 && SOURCE_WEIGHT_LABELS[source])
    .sort((a, b) => b[1] - a[1]);
  if (learned.length === 0) return null;
  const lines = learned.map(
    ([source, weight]) =>
      `${SOURCE_WEIGHT_LABELS[source]} ${weight.toFixed(1)}× (${weight > 1 ? "they keep winning here" : "they haven't been landing"})`,
  );
  return (
    <p className="text-xs text-muted">
      From what&apos;s worked for your site so far, Claudia is weighing {lines.join(", ")}.
    </p>
  );
}

function TopicList({
  topics,
  canGenerate,
  articleCost,
}: {
  topics: Topic[];
  canGenerate: boolean;
  articleCost: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const settingUp = useSetupInProgress();

  const generate = useMutation({
    mutationFn: (topicId: string) =>
      apiPost<{ articleId: string }>("/api/articles/generate", { topicId }),
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
      toast.danger(getErrorMessage(error, "Could not generate article"));
    },
  });

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {topics.map((topic) => {
        const isGenerating = generate.isPending && generate.variables === topic.id;
        return (
          <li
            key={topic.id}
            className="flex items-start justify-between gap-3 p-4 transition-colors hover:bg-surface-secondary/40"
          >
            {/* Title, subtitle, and details — stacked so the row never needs horizontal scroll */}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-1">
                <p className="font-medium leading-snug text-foreground">{topic.title}</p>
                {/* The thesis is the one line that says why this will drive
                    traffic — always preferred over the generic rationale. */}
                {topic.thesis || topic.rationale ? (
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                    {topic.thesis ?? topic.rationale}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="capitalize text-muted">{sourceBadge(topic) ?? topic.source}</span>
                {topic.intentTier && INTENT_BADGES[topic.intentTier] ? (
                  <span className={topic.intentTier === "bofu" ? "text-success" : "text-muted"}>
                    {INTENT_BADGES[topic.intentTier]}
                  </span>
                ) : null}
                <span className={cn("uppercase tracking-wide", statusTextClass(topic.status))}>
                  {topic.status}
                </span>
                {topic.score != null ? (
                  <span className="text-xs text-muted tabular-nums">Score {topic.score}</span>
                ) : null}
              </div>
            </div>

            {/* Action stays pinned to the right and always visible */}
            <div className="shrink-0">
              {canGenerate ? (
                <Tooltip delay={300}>
                  <Button
                    size="sm"
                    isIconOnly
                    aria-label={`Generate article · ${articleCost} credits`}
                    isPending={isGenerating}
                    isDisabled={generate.isPending || settingUp}
                    onPress={() => generate.mutate(topic.id)}
                  >
                    {isGenerating ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <SparklesIcon className="size-4" />
                    )}
                  </Button>
                  <Tooltip.Content>
                    <p>
                      {settingUp
                        ? "Claudia is setting up your brand — generation unlocks when she's done."
                        : `Generate article · ${articleCost} credits`}
                    </p>
                  </Tooltip.Content>
                </Tooltip>
              ) : (
                <Link
                  href="/account?tab=billing&upgrade=1"
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                  title="You need credits to generate an article"
                >
                  Get credits
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
