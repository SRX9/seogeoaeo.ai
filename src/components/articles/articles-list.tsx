"use client";

import { Button, Card, SearchField } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  ArticlesIcon,
  CheckIcon,
  ResearchIcon,
  UserInputIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import type { Article, Topic } from "@/lib/api/queries";
import { cn } from "@/lib/cn";

type ContentSectionKey = "review" | "scheduled" | "published";

type ArticlesListProps = {
  articles: Article[];
  topics: Topic[];
  autoPublish: boolean;
};

const ATTENTION_STATUSES = new Set(["failed", "error", "rejected", "needs_attention"]);
const REVIEW_STATUSES = new Set(["draft", "pending", "review", "awaiting_review", "in_review"]);
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const SECTION_COPY: Record<
  ContentSectionKey,
  { title: string; description: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  review: {
    title: "Needs review",
    description: "Content waiting for a decision or correction.",
    Icon: UserInputIcon,
  },
  scheduled: {
    title: "Scheduled",
    description: "Work Claudia is preparing or has lined up for publishing.",
    Icon: ArticlesIcon,
  },
  published: {
    title: "Published",
    description: "Live content Claudia is monitoring and improving.",
    Icon: CheckIcon,
  },
};

function parseGateResults(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((gate) => {
      if (!gate || typeof gate !== "object") return [];
      const candidate = gate as { passed?: unknown };
      return typeof candidate.passed === "boolean" ? [{ passed: candidate.passed }] : [];
    });
  } catch {
    return [];
  }
}

function needsAttention(article: Article) {
  return (
    ATTENTION_STATUSES.has(article.status) ||
    parseGateResults(article.gateResultsJson).some((gate) => !gate.passed)
  );
}

function sectionFor(article: Article, autoPublish: boolean): ContentSectionKey {
  if (article.status === "published" || article.publication?.status === "published") {
    return "published";
  }
  if (needsAttention(article) || (!autoPublish && REVIEW_STATUSES.has(article.status))) {
    return "review";
  }
  return "scheduled";
}

function articleStatus(article: Article, section: ContentSectionKey) {
  if (needsAttention(article)) return { label: "Needs attention", tone: "danger" as const };
  if (section === "published") return { label: "Published", tone: "success" as const };
  if (section === "review") return { label: "Needs review", tone: "warning" as const };
  if (article.status === "scheduled") return { label: "Scheduled", tone: "accent" as const };
  if (article.status === "approved") return { label: "Ready to publish", tone: "accent" as const };
  return { label: "Claudia is preparing it", tone: "default" as const };
}

function whyCreated(article: Article, topic: Topic | undefined) {
  if (topic?.rationale) return topic.rationale;
  if (topic?.angle) return topic.angle;
  if (topic?.title) return `Claudia created this to cover the researched opportunity “${topic.title}”.`;
  if (article.metaDescription) return article.metaDescription;
  return "Claudia created this from a researched customer or discovery opportunity.";
}

function providerName(provider: string | undefined) {
  if (!provider) return null;
  const labels: Record<string, string> = {
    wordpress: "WordPress",
    ghost: "Ghost",
    webhook: "your connected website",
  };
  return labels[provider] ?? provider.replace(/[_-]/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function destinationCopy(article: Article, section: ContentSectionKey) {
  const provider = providerName(article.publication?.provider);
  if (section === "published") {
    const publishedAt = article.publication?.publishedAt;
    const date = publishedAt ? DATE_FORMATTER.format(new Date(publishedAt)) : null;
    return `${provider ? `Published to ${provider}` : "Published"}${date ? ` · ${date}` : ""}`;
  }
  if (provider) return `${article.status === "scheduled" ? "Scheduled" : "Preparing"} for ${provider}`;
  return "Claudia will ask for a destination when the content is ready.";
}

function performanceCopy(article: Article, section: ContentSectionKey) {
  const performance = article.performance;
  if (performance?.verdict === "winner") return "Gaining traction";
  if (performance?.verdict === "stalling") return "Claudia is preparing an improvement";
  if (performance?.verdict === "dead") return "Needs improvement";
  if (performance?.position != null) return `Average position ${Math.round(performance.position)}`;
  return section === "published" ? "Waiting for the first reliable signal" : null;
}

function ContentRow({
  article,
  topic,
  section,
}: {
  article: Article;
  topic: Topic | undefined;
  section: ContentSectionKey;
}) {
  const status = articleStatus(article, section);
  const performance = performanceCopy(article, section);

  return (
    <article className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(12rem,0.7fr)_2rem] lg:items-center">
      <div className="min-w-0">
        <ToneText tone={status.tone} className="text-xs">
          {status.label}
        </ToneText>
        <Link
          href={`/articles/${article.id}`}
          className="mt-1 block w-fit max-w-full text-base font-semibold leading-6 text-foreground no-underline hover-fine:text-accent"
        >
          <span className="line-clamp-2">{article.title}</span>
        </Link>
        <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-muted">
          {whyCreated(article, topic)}
        </p>
      </div>
      <div className="min-w-0 space-y-1 text-sm leading-5">
        <p className="text-foreground">{destinationCopy(article, section)}</p>
        {performance ? <p className="text-muted">{performance}</p> : null}
      </div>
      <Link
        href={`/articles/${article.id}`}
        aria-label={`Open ${article.title}`}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "hidden min-h-10 min-w-10 transition-transform active:scale-[0.96] lg:inline-flex",
        )}
      >
        <ArrowRightIcon className="size-4" />
      </Link>
    </article>
  );
}

function ContentSection({
  section,
  articles,
  topicById,
}: {
  section: ContentSectionKey;
  articles: Article[];
  topicById: Map<string, Topic>;
}) {
  if (articles.length === 0) return null;
  const copy = SECTION_COPY[section];
  return (
    <section aria-labelledby={`content-${section}-title`}>
      <Card className="overflow-hidden rounded-3xl p-0">
        <Card.Header className="flex-row items-start gap-3 px-5 py-5 sm:px-6">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
            aria-hidden
          >
            <copy.Icon className="size-5" />
          </span>
          <div>
            <Card.Title id={`content-${section}-title`}>{copy.title}</Card.Title>
            <Card.Description className="mt-1">{copy.description}</Card.Description>
          </div>
          <span className="ml-auto text-sm tabular-nums text-muted">{articles.length}</span>
        </Card.Header>
        <Card.Content className="divide-y divide-separator p-0">
          {articles.map((article) => (
            <ContentRow
              key={article.id}
              article={article}
              topic={article.topicId ? topicById.get(article.topicId) : undefined}
              section={section}
            />
          ))}
        </Card.Content>
      </Card>
    </section>
  );
}

export function ArticlesList({ articles, topics, autoPublish }: ArticlesListProps) {
  const [search, setSearch] = useState("");
  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const groups = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const next: Record<ContentSectionKey, Article[]> = {
      review: [],
      scheduled: [],
      published: [],
    };
    for (const article of articles) {
      const topic = article.topicId ? topicById.get(article.topicId) : undefined;
      if (
        normalized &&
        !article.title.toLowerCase().includes(normalized) &&
        !topic?.title.toLowerCase().includes(normalized)
      ) {
        continue;
      }
      next[sectionFor(article, autoPublish)].push(article);
    }
    return next;
  }, [articles, autoPublish, search, topicById]);

  const visibleCount = groups.review.length + groups.scheduled.length + groups.published.length;
  return (
    <div className="space-y-5">
      {articles.length > 5 ? (
        <div className="flex items-center justify-between gap-4">
          <SearchField
            aria-label="Search content"
            className="w-full sm:max-w-sm"
            value={search}
            onChange={setSearch}
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search content" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <span className="hidden text-sm tabular-nums text-muted sm:block">
            {visibleCount} {visibleCount === 1 ? "item" : "items"}
          </span>
        </div>
      ) : null}

      {articles.length === 0 ? (
        <Card className="rounded-3xl p-0">
          <Card.Content className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
            <ArticlesIcon className="size-8 text-muted" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">Claudia is preparing the first content</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              Useful drafts and published work will appear here automatically.
            </p>
          </Card.Content>
        </Card>
      ) : visibleCount === 0 ? (
        <Card className="rounded-3xl p-0">
          <Card.Content className="flex min-h-40 flex-col items-center justify-center px-6 py-8 text-center">
            <p className="text-sm text-muted">No content matches that search.</p>
            <Button variant="ghost" className="mt-3" onPress={() => setSearch("")}>
              Clear search
            </Button>
          </Card.Content>
        </Card>
      ) : (
        <>
          <ContentSection section="review" articles={groups.review} topicById={topicById} />
          <ContentSection section="scheduled" articles={groups.scheduled} topicById={topicById} />
          <ContentSection section="published" articles={groups.published} topicById={topicById} />
        </>
      )}

      <Card className="rounded-3xl p-0">
        <Card.Content className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
              aria-hidden
            >
              <ResearchIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Content ideas</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                {topics.length > 0
                  ? `Claudia has ${topics.length} researched ${topics.length === 1 ? "idea" : "ideas"} in the library.`
                  : "Claudia is researching the next useful opportunities."}
              </p>
            </div>
          </div>
          <Link
            href="/topics"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-11 shrink-0 transition-transform active:scale-[0.96]",
            )}
          >
            See ideas
            <ArrowRightIcon className="size-4" />
          </Link>
        </Card.Content>
      </Card>
    </div>
  );
}
