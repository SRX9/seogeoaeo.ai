"use client";

import { buttonVariants } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Table } from "@heroui/react/table";
import { EmptyState } from "@heroui-pro/react/empty-state";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Key, SortDescriptor } from "react-aria-components";
import { ChevronRightIcon } from "@/components/icons";
import { parseTags } from "@/lib/articles/format";
import { statusColor } from "@/lib/ui/status";

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  updatedAt: string;
  tags: string | null;
};

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
    const sorted = [...articles].sort((a, b) => compare(a, b, column));
    return sort.direction === "descending" ? sorted.reverse() : sorted;
  }, [articles, sort]);

  if (articles.length === 0) {
    return (
      <EmptyState className="rounded-xl border border-dashed border-border">
        <EmptyState.Header>
          <EmptyState.Title>No articles yet</EmptyState.Title>
          <EmptyState.Description>
            Generate your first article from a research-backed topic or a manual idea.
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
    <Table>
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
                  className="group cursor-pointer"
                >
                  <Table.Cell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground transition-colors group-hover:text-accent">
                        {article.title}
                      </span>
                      <span className="text-xs text-muted">/{article.slug}</span>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Chip color={statusColor(article.status)} variant="soft" size="sm">
                      {article.status}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {tags.slice(0, 2).map((tag) => (
                          <Chip key={tag} size="sm" variant="soft">
                            {tag}
                          </Chip>
                        ))}
                        {tags.length > 2 ? (
                          <Chip size="sm" variant="soft" className="text-muted">
                            +{tags.length - 2}
                          </Chip>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-sm text-muted tabular-nums">
                      {new Date(article.updatedAt).toLocaleDateString()}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <ChevronRightIcon
                      className="size-4 text-muted/60 transition-all group-hover:translate-x-0.5 group-hover:text-accent"
                    />
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
