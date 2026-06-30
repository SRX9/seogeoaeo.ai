"use client";

import { buttonVariants } from "@heroui/react/button";
import { Button, Card, Chip, Input, Label, Spinner, Tooltip, toast } from "@heroui/react";
import { Segment } from "@heroui-pro/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { InlineLoader } from "@/components/feedback/states";
import { PenIcon, PlusIcon, SparklesIcon } from "@/components/icons";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, useTopics, type Topic } from "@/lib/api/queries";
import { statusColor } from "@/lib/ui/status";

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
            onSelectionChange={(key) => setFilter(String(key))}
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
        <p className="text-sm text-muted">
          {filter === "manual"
            ? "No manual topics yet. Add one in the Manual topic tab."
            : "Run research to populate ranked topic ideas."}
        </p>
      ) : (
        <TopicList topics={visibleTopics} canGenerate={canGenerate} articleCost={articleCost} />
      )}
    </section>
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

  const generate = useMutation({
    mutationFn: (topicId: string) =>
      apiPost<{ articleId: string }>("/api/articles/generate", { topicId }),
    onSuccess: (result) => {
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
                {topic.rationale ? (
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted">
                    {topic.rationale}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip variant="soft" size="sm" className="capitalize">
                  {topic.source}
                </Chip>
                <Chip color={statusColor(topic.status)} variant="soft" size="sm">
                  {topic.status}
                </Chip>
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
                    isDisabled={generate.isPending}
                    onPress={() => generate.mutate(topic.id)}
                  >
                    {isGenerating ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <SparklesIcon className="size-4" />
                    )}
                  </Button>
                  <Tooltip.Content>
                    <p>Generate article · {articleCost} credits</p>
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
