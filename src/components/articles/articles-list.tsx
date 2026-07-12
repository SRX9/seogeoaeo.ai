"use client";

import { buttonVariants } from "@heroui/react/button";
import { Table } from "@heroui/react/table";
import { EmptyState } from "@heroui-pro/react/empty-state";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Key, SortDescriptor } from "react-aria-components";
import { ArticlesIcon } from "@/components/icons";
import { StatusText } from "@/components/ui/status-text";
import { parseTags } from "@/lib/articles/format";

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
  tags: string | null;
  /** C4: latest performance checkpoint, when one has run. */
  performance?: { verdict: "winner" | "stalling" | "dead" | "watching"; day: number; position: number | null } | null;
};

/** Owner-language line for a C4 verdict (plain text: no pills). */
function performanceLine(p: NonNullable<ArticleRow["performance"]>): string {
  const pos = p.position != null ? `#${Math.round(p.position)}` : null;
  switch (p.verdict) {
    case "winner":
      return pos ? `Winning at ${pos} in search` : "Winning in search";
    case "stalling":
      return pos ? `Stalling at ${pos}. Title update queued.` : "Stalling. Title update queued.";
    case "dead":
      return "No traction after 90 days";
    default:
      return `Watching (day ${p.day})`;
  }
}

type ArticlesListProps = {
  articles: ArticleRow[];
};

function compare(a: ArticleRow, b: ArticleRow, column: Key) {
  if (column === "updated") {
    return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
  }
  if (column === "status") return a.status.localeCompare(b.status);
  return a.title.localeCompare(b.title);
}

export function ArticlesList({ articles }: ArticlesListProps) {
  const [sort, setSort] = useState<SortDescriptor>({
    column: "updated",
    direction: "descending",
  });

  const rows = useMemo(() => {
    const column = sort.column ?? "updated";
    return [...articles].sort((a, b) => {
      const result = compare(a, b, column);
      return sort.direction === "descending" ? -result : result;
    });
  }, [articles, sort]);

  if (articles.length === 0) {
    return (
      <EmptyState className="material-panel rounded-2xl border-dashed">
        <EmptyState.Header>
          <EmptyState.Media variant="icon">
            <ArticlesIcon />
          </EmptyState.Media>
          <EmptyState.Title>No articles yet</EmptyState.Title>
          <EmptyState.Description>
            Claudia drafts articles from researched topics. You can also generate one from any
            topic in the queue.
          </EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.Content>
          <Link href="/topics" className={buttonVariants()}>
            Go to topics
          </Link>
        </EmptyState.Content>
      </EmptyState>
    );
  }

  return (
    <Table variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label="Articles"
          className="min-w-[640px]"
          sortDescriptor={sort}
          onSortChange={setSort}
        >
          <Table.Header>
            <Table.Column id="title" isRowHeader allowsSorting>
              Title
            </Table.Column>
            <Table.Column id="status" allowsSorting>
              Status
            </Table.Column>
            <Table.Column id="tags">Tags</Table.Column>
            <Table.Column id="updated" allowsSorting>
              Updated
            </Table.Column>
            <Table.Column id="open" aria-label="Open" />
          </Table.Header>
          <Table.Body>
            {rows.map((article) => {
              const tags = parseTags(article.tags);
              return (
                <Table.Row
                  key={article.id}
                  id={article.id}
                  href={`/articles/${article.id}`}
                  className="cursor-pointer"
                >
                  <Table.Cell>
                    <div className="flex flex-col">
                      <span className="font-medium tracking-tight text-foreground">
                        {article.title}
                      </span>
                      <span className="text-xs tracking-[0.01em] text-muted">
                        /{article.slug}
                      </span>
                      {article.performance ? (
                        <span
                          className={`text-xs ${article.performance.verdict === "winner" ? "text-success" : "text-muted"}`}
                        >
                          {performanceLine(article.performance)}
                        </span>
                      ) : null}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusText status={article.status} />
                  </Table.Cell>
                  <Table.Cell>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="text-xs tracking-[0.01em] text-foreground">
                            {tag}
                          </span>
                        ))}
                        {tags.length > 2 ? (
                          <span className="text-xs tracking-[0.01em] text-muted">
                            +{tags.length - 2}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-muted">No tags</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-sm text-muted tabular-nums">
                      {new Date(article.updatedAt).toLocaleDateString()}
                    </span>
                  </Table.Cell>
                  <Table.Cell aria-label="Open article" />
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
