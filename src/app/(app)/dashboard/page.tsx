"use client";

import { Table } from "@heroui/react/table";
import Link from "next/link";
import { useMemo } from "react";
import { ClaudiaHero } from "@/components/dashboard/claudia-hero";
import { ContentAgentSnapshot } from "@/components/dashboard/content-agent-snapshot";
import { VisibilitySnapshot } from "@/components/dashboard/visibility-snapshot";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { CardSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/feedback/skeletons";
import {
  combineQueries,
  useArticles,
  useAutomation,
  useCredits,
  useMe,
  useVisibilitySummary,
} from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import { statusColor } from "@/lib/ui/status";

const STATUS_TEXT: Record<string, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent",
};
const statusTextClass = (status: string) => STATUS_TEXT[statusColor(status)] ?? "text-muted";

const visibilitySkeleton = <CardSkeleton lines={3} />;
const contentAgentSkeleton = <StatGridSkeleton />;
const recentArticlesSkeleton = <TableSkeleton rows={3} />;

export default function DashboardPage() {
  const me = useMe();
  const credits = useCredits();
  const automation = useAutomation();
  const visibility = useVisibilitySummary();
  const articles = useArticles();

  const contentAgent = useMemo(
    () => combineQueries(automation, credits, me),
    [automation, credits, me],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Claudia, working on your visibility and content."
      />

      {/* The hero owns its own loading/ignition/live-setup states. */}
      <ClaudiaHero />

      <Section
        query={visibility}
        skeleton={visibilitySkeleton}
        errorLabel="Couldn't load your visibility."
      >
        {(summary) => <VisibilitySnapshot summary={summary} />}
      </Section>

      <Section
        query={contentAgent}
        skeleton={contentAgentSkeleton}
        errorLabel="Couldn't load your content agent."
      >
        {([automationData, creditsData, meData]) => (
          <ContentAgentSnapshot
            automation={automationData}
            credits={creditsData.balance}
            monthlyCreditGrant={meData.subscription?.monthlyCreditGrant ?? 0}
          />
        )}
      </Section>

      <Section query={articles} skeleton={recentArticlesSkeleton}>
        {(data) => {
          const recentArticles = data.articles.slice(0, 5);
          if (recentArticles.length === 0) return null;
          return (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Recent articles</h2>
                <Link href="/articles" className="text-sm text-muted hover:text-foreground">
                  View all
                </Link>
              </div>
              <Table>
                <Table.ScrollContainer>
                  <Table.Content aria-label="Recent articles" className="min-w-[480px]">
                    <Table.Header>
                      <Table.Column id="title" isRowHeader>
                        Title
                      </Table.Column>
                      <Table.Column id="status">Status</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {recentArticles.map((article) => (
                        <Table.Row
                          key={article.id}
                          id={article.id}
                          href={`/articles/${article.id}`}
                          className="cursor-pointer"
                        >
                          <Table.Cell>
                            <span className="font-medium text-foreground">{article.title}</span>
                          </Table.Cell>
                          <Table.Cell>
                            <span
                              className={cn(
                                "text-sm font-medium capitalize",
                                statusTextClass(article.status),
                              )}
                            >
                              {article.status}
                            </span>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </section>
          );
        }}
      </Section>
    </div>
  );
}
