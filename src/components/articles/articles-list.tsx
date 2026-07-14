"use client";

import type { SortDescriptor } from "@heroui/react";
import {
  Button,
  Card,
  Dropdown,
  Label,
  SearchField,
  Table,
  Tooltip,
} from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState, Segment } from "@heroui-pro/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArticlesIcon, ChevronRightIcon, LayersIcon, ResearchIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import type { Article, Topic } from "@/lib/api/queries";

type FilterKey = "all" | "draft" | "review" | "published" | "attention";
type SortKey = "title" | "status" | "updated";
type OptionalColumn = "topic" | "signal" | "destination" | "performance";

type ArticlesListProps = {
  articles: Article[];
  topics: Topic[];
};

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "review", label: "In Review" },
  { id: "published", label: "Published" },
  { id: "attention", label: "Needs Attention" },
];

const COLUMN_OPTIONS: Array<{ id: OptionalColumn; label: string }> = [
  { id: "topic", label: "Target Topic" },
  { id: "signal", label: "Research Signal" },
  { id: "destination", label: "Destination" },
  { id: "performance", label: "Performance" },
];

const DEFAULT_COLUMNS = new Set<OptionalColumn>(COLUMN_OPTIONS.map((column) => column.id));

function parseGateResults(value: string | null): Array<{ gate: string; passed: boolean }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (gate): gate is { gate: string; passed: boolean } =>
        Boolean(
          gate &&
            typeof gate === "object" &&
            "gate" in gate &&
            "passed" in gate &&
            typeof gate.gate === "string" &&
            typeof gate.passed === "boolean",
        ),
    );
  } catch {
    return [];
  }
}

function needsAttention(article: Article): boolean {
  if (["failed", "error", "rejected", "needs_attention"].includes(article.status)) return true;
  return parseGateResults(article.gateResultsJson).some(
    (gate) => gate.gate === "style-lint" && !gate.passed,
  );
}

function categoryFor(article: Article): Exclude<FilterKey, "all"> {
  if (article.status === "published") return "published";
  if (needsAttention(article)) return "attention";
  if (["approved", "pending", "review", "awaiting_review", "in_review"].includes(article.status)) {
    return "review";
  }
  return "draft";
}

function statusLabel(article: Article): string {
  const category = categoryFor(article);
  if (category === "attention") return "Needs Attention";
  if (article.status === "approved") return "Approved";
  return FILTERS.find((item) => item.id === category)?.label ?? "Draft";
}

function statusColor(category: Exclude<FilterKey, "all">) {
  if (category === "published") return "success" as const;
  if (category === "review") return "warning" as const;
  if (category === "attention") return "danger" as const;
  return "default" as const;
}

function compareArticles(a: Article, b: Article, key: SortKey): number {
  if (key === "updated") return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  if (key === "status") return statusLabel(a).localeCompare(statusLabel(b));
  return a.title.localeCompare(b.title);
}

function formatRelativeTime(value: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function topicSignal(topic: Topic | undefined, article: Article) {
  if (topic?.evidenceJson) {
    try {
      const evidence = JSON.parse(topic.evidenceJson) as { sourceType?: string };
      const labels: Record<string, string> = {
        gsc: "Google Search",
        gsc_query: "Google Search",
        competitor_gap: "Competitor Gap",
        trend_query: "Market Trend",
        web_search: "Web Research",
        keyword_api: "Keyword Signal",
      };
      if (evidence.sourceType && labels[evidence.sourceType]) return labels[evidence.sourceType];
    } catch {
      // A malformed evidence payload should not prevent the article list rendering.
    }
  }
  if (topic?.intentTier === "bofu") return "Buying Intent";
  if (topic?.intentTier === "mofu") return "Comparison Intent";
  return article.shape?.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase()) ?? "AI Answer";
}

function performanceLabel(article: Article) {
  if (!article.performance) return "Not Measured";
  if (article.performance.position != null) return `Position ${Math.round(article.performance.position)}`;
  return article.performance.verdict.replace(/^./, (letter) => letter.toUpperCase());
}

function ColumnsMenu({
  columns,
  onToggle,
}: {
  columns: Set<OptionalColumn>;
  onToggle: (column: OptionalColumn) => void;
}) {
  return (
    <Dropdown>
      <Button size="sm" variant="ghost">
        <LayersIcon className="size-4" />
        Columns
      </Button>
      <Dropdown.Popover>
        <Dropdown.Menu
          selectionMode="multiple"
          selectedKeys={columns}
          onAction={(key) => onToggle(String(key) as OptionalColumn)}
        >
          {COLUMN_OPTIONS.map((column) => (
            <Dropdown.Item key={column.id} id={column.id} textValue={column.label}>
              <Dropdown.ItemIndicator />
              <Label>{column.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function ArticleStatus({ article }: { article: Article }) {
  const category = categoryFor(article);
  return (
    <ToneText tone={statusColor(category)} className="text-xs">
      {statusLabel(article)}
    </ToneText>
  );
}

function MobileArticleCards({ rows, topicById }: { rows: Article[]; topicById: Map<string, Topic> }) {
  return (
    <div className="grid gap-3 md:hidden">
      {rows.map((article) => {
        const topic = article.topicId ? topicById.get(article.topicId) : undefined;
        return (
          <Card key={article.id} className="gap-4">
            <Card.Header className="flex-row items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <Card.Title className="line-clamp-2 text-base">{article.title}</Card.Title>
                <Card.Description className="truncate">/{article.slug}</Card.Description>
              </div>
              <ArticleStatus article={article} />
            </Card.Header>
            <Card.Content className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Target Topic</p>
                <p className="mt-1 line-clamp-2 text-foreground">{topic?.title ?? "Not linked"}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Updated</p>
                <time dateTime={article.updatedAt} className="mt-1 block text-foreground" suppressHydrationWarning>
                  {formatRelativeTime(article.updatedAt)}
                </time>
              </div>
            </Card.Content>
            <Card.Footer className="justify-between gap-3">
              <span className="text-xs font-medium text-muted">{topicSignal(topic, article)}</span>
              <Link href={`/articles/${article.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Open
                <ChevronRightIcon className="size-4" />
              </Link>
            </Card.Footer>
          </Card>
        );
      })}
    </div>
  );
}

function ArticleTable({
  rows,
  topicById,
  columns,
  sortDescriptor,
  onSortChange,
}: {
  rows: Article[];
  topicById: Map<string, Topic>;
  columns: Set<OptionalColumn>;
  sortDescriptor: SortDescriptor;
  onSortChange: (descriptor: SortDescriptor) => void;
}) {
  return (
    <div className="hidden md:block">
      <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Articles"
            className="min-w-[920px]"
            sortDescriptor={sortDescriptor}
            onSortChange={onSortChange}
          >
            <Table.Header>
              <Table.Column allowsSorting id="status">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>Status</Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting isRowHeader id="title">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>Article</Table.SortableColumnHeader>
                )}
              </Table.Column>
              {columns.has("topic") ? <Table.Column id="topic">Target Topic</Table.Column> : null}
              {columns.has("signal") ? <Table.Column id="signal">Research Signal</Table.Column> : null}
              <Table.Column allowsSorting id="updated">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>Updated</Table.SortableColumnHeader>
                )}
              </Table.Column>
              {columns.has("destination") ? <Table.Column id="destination">Destination</Table.Column> : null}
              {columns.has("performance") ? <Table.Column id="performance">Performance</Table.Column> : null}
              <Table.Column id="action" className="text-end">Open</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((article) => {
                const topic = article.topicId ? topicById.get(article.topicId) : undefined;
                return (
                  <Table.Row key={article.id} id={article.id}>
                    <Table.Cell><ArticleStatus article={article} /></Table.Cell>
                    <Table.Cell>
                      <Link href={`/articles/${article.id}`} className="block max-w-sm no-underline">
                        <span className="line-clamp-1 font-medium text-foreground">{article.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">/{article.slug}</span>
                      </Link>
                    </Table.Cell>
                    {columns.has("topic") ? (
                      <Table.Cell><span className="line-clamp-2 max-w-52 text-sm">{topic?.title ?? "Not linked"}</span></Table.Cell>
                    ) : null}
                    {columns.has("signal") ? (
                      <Table.Cell><span className="text-xs font-medium text-muted">{topicSignal(topic, article)}</span></Table.Cell>
                    ) : null}
                    <Table.Cell>
                      <time dateTime={article.updatedAt} className="text-sm tabular-nums text-muted" suppressHydrationWarning>
                        {formatRelativeTime(article.updatedAt)}
                      </time>
                    </Table.Cell>
                    {columns.has("destination") ? (
                      <Table.Cell>
                        <ToneText tone={article.status === "published" ? "success" : "default"} className="text-xs">
                          {article.status === "published" ? "Live" : "Not Published"}
                        </ToneText>
                      </Table.Cell>
                    ) : null}
                    {columns.has("performance") ? (
                      <Table.Cell><span className="text-sm tabular-nums text-muted">{performanceLabel(article)}</span></Table.Cell>
                    ) : null}
                    <Table.Cell className="text-end">
                      <Tooltip delay={300}>
                        <Link
                          href={`/articles/${article.id}`}
                          aria-label={`Open ${article.title}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          <ChevronRightIcon className="size-4" />
                        </Link>
                        <Tooltip.Content>Open Article</Tooltip.Content>
                      </Tooltip>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

export function ArticlesList({ articles, topics }: ArticlesListProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({ column: "updated", direction: "descending" });
  const [columns, setColumns] = useState<Set<OptionalColumn>>(() => new Set(DEFAULT_COLUMNS));

  const topicById = useMemo(() => new Map(topics.map((topic) => [topic.id, topic])), [topics]);
  const counts = useMemo(() => {
    const next = { draft: 0, review: 0, published: 0, attention: 0 };
    for (const article of articles) next[categoryFor(article)] += 1;
    return next;
  }, [articles]);

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return articles
      .filter((article) => {
        if (filter !== "all" && categoryFor(article) !== filter) return false;
        if (!normalizedSearch) return true;
        const topic = article.topicId ? topicById.get(article.topicId) : undefined;
        return [article.title, article.slug, topic?.title].some((value) => value?.toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => {
        const compared = compareArticles(a, b, String(sortDescriptor.column) as SortKey);
        return sortDescriptor.direction === "descending" ? -compared : compared;
      });
  }, [articles, filter, search, sortDescriptor, topicById]);

  function toggleColumn(column: OptionalColumn) {
    setColumns((current) => {
      const next = new Set(current);
      if (next.has(column)) next.delete(column);
      else next.add(column);
      return next;
    });
  }

  if (articles.length === 0) {
    return (
      <Card>
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Media variant="icon"><ArticlesIcon /></EmptyState.Media>
            <EmptyState.Title>No Articles Yet</EmptyState.Title>
            <EmptyState.Description>
              Start with a researched topic and Claudia will build the first draft.
            </EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Link href="/topics" className={buttonVariants({ variant: "primary" })}>
              <ResearchIcon className="size-4" />
              Browse Topics
            </Link>
          </EmptyState.Content>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Article status summary">
        {FILTERS.slice(1).map((item) => {
          const category = item.id as Exclude<FilterKey, "all">;
          return (
            <Card key={item.id} variant={filter === category ? "tertiary" : "default"} className="p-2">
              <Button
                fullWidth
                variant="ghost"
                className="h-auto justify-between px-3 py-2 text-start"
                aria-pressed={filter === category}
                onPress={() => setFilter(category)}
              >
                <span>
                  <span className="block text-sm font-medium text-muted">{item.label}</span>
                  <span className="mt-1 block text-2xl font-semibold leading-none tabular-nums text-foreground">{counts[category]}</span>
                </span>
                <ToneText tone={statusColor(category)} className="text-xs tabular-nums">{Math.round((counts[category] / articles.length) * 100)}%</ToneText>
              </Button>
            </Card>
          );
        })}
      </section>

      <Card className="gap-5">
        <Card.Header className="flex-col items-stretch gap-4">
          <div className="overflow-x-auto pb-1">
            <Segment
              className="min-w-max"
              aria-label="Filter articles by status"
              selectedKey={filter}
              size="sm"
              variant="ghost"
              onSelectionChange={(key) => setFilter(String(key) as FilterKey)}
            >
              {FILTERS.map((item) => <Segment.Item key={item.id} id={item.id}>{item.label}</Segment.Item>)}
            </Segment>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SearchField aria-label="Search articles" value={search} onChange={setSearch} className="w-full sm:max-w-sm">
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search articles" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="text-sm tabular-nums text-muted">{rows.length} {rows.length === 1 ? "article" : "articles"}</span>
              <ColumnsMenu columns={columns} onToggle={toggleColumn} />
            </div>
          </div>
        </Card.Header>

        {rows.length > 0 ? (
          <Card.Content>
            <MobileArticleCards rows={rows} topicById={topicById} />
            <ArticleTable
              rows={rows}
              topicById={topicById}
              columns={columns}
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
            />
          </Card.Content>
        ) : (
          <Card.Content>
            <EmptyState size="sm" className="rounded-2xl bg-surface-secondary">
              <EmptyState.Header>
                <EmptyState.Title>No Matching Articles</EmptyState.Title>
                <EmptyState.Description>Try another search or clear the current status filter.</EmptyState.Description>
              </EmptyState.Header>
              <EmptyState.Content>
                <Button variant="outline" size="sm" onPress={() => { setSearch(""); setFilter("all"); }}>Clear Filters</Button>
              </EmptyState.Content>
            </EmptyState>
          </Card.Content>
        )}
      </Card>
    </div>
  );
}
