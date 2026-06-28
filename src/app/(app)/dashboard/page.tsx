"use client";

import { buttonVariants } from "@heroui/react/button";
import { Chip } from "@heroui/react/chip";
import { Table } from "@heroui/react/table";
import Link from "next/link";
import { DashboardKpis } from "@/components/dashboard/dashboard-kpis";
import { AutomationCard } from "@/components/dashboard/automation-card";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { PageHeader } from "@/components/layout/page-header";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useDashboard } from "@/lib/api/queries";
import { statusColor } from "@/lib/ui/status";
import { autonomyLabel } from "@/lib/workspace/settings";

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard();

  if (isLoading) {
    return <PageLoader label="Loading your overview…" />;
  }
  if (error || !data) {
    return <PageError error={error} onRetry={() => refetch()} />;
  }

  const { latestRun, recentArticles } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your autonomous content pipeline at a glance."
        actions={
          <Link href="/topics" className={buttonVariants({ size: "sm" })}>
            Manage topics
          </Link>
        }
        meta={
          <>
            <Chip color={data.active ? "success" : "warning"} variant="soft">
              {data.active ? (data.plan?.name ?? "Active plan") : "Free plan"}
            </Chip>
            <Chip variant="soft">{autonomyLabel(data.autonomyMode)}</Chip>
            {latestRun ? (
              <Chip color={statusColor(latestRun.status)} variant="soft">
                Research {latestRun.status}
              </Chip>
            ) : null}
          </>
        }
      />

      {!data.active ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {data.canGenerate ? "You're ready to generate" : "You're on the free tier"}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {data.canGenerate
                ? `You have ${data.credits.total.toLocaleString()} credits — enough for ${Math.floor(
                    data.credits.total / data.creditCosts.article_generation,
                  )} article${
                    Math.floor(data.credits.total / data.creditCosts.article_generation) === 1
                      ? ""
                      : "s"
                  }. Subscribe for a monthly allowance and to publish.`
                : "You're out of credits. Pick a plan for a monthly credit allowance and auto-publishing."}
            </p>
          </div>
          <Link
            href={data.canGenerate ? "/topics" : "/settings?tab=billing"}
            className={`${buttonVariants({ size: "sm" })} shrink-0`}
          >
            {data.canGenerate ? "Generate an article" : "View plans"}
          </Link>
        </div>
      ) : null}

      <DashboardKpis
        credits={data.credits}
        monthlyCreditGrant={data.monthlyCreditGrant}
        totalArticles={data.totalArticles}
        approvedArticles={data.approvedArticles}
        pendingTopics={data.pendingTopics}
      />

      <AutomationCard automation={data.automation} />

      <OnboardingChecklist steps={data.onboardingSteps} />

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">Topic research</h2>
            <p className="mt-1 text-sm text-muted">
              {latestRun
                ? `Last run ${latestRun.status}${
                    typeof latestRun.topicsCreated === "number"
                      ? ` · ${latestRun.topicsCreated} topics added`
                      : ""
                  }`
                : "No research yet — discover ranked topics worth writing about."}
            </p>
            {latestRun?.summary ? (
              <p className="mt-1 text-sm text-muted">{latestRun.summary}</p>
            ) : null}
          </div>
          <Link
            href="/topics"
            className={`${buttonVariants({ size: "sm", variant: "secondary" })} shrink-0`}
          >
            Manage topics
          </Link>
        </div>
      </section>

      {recentArticles.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Recent articles</h2>
            <Link href="/articles" className="text-sm text-muted hover:text-foreground">
              View all
            </Link>
          </div>
          <Table>
            <Table.ScrollContainer>
              <Table.Content
                aria-label="Recent articles"
                className="min-w-[480px]"
              >
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
                        <Chip color={statusColor(article.status)} variant="soft" size="sm">
                          {article.status}
                        </Chip>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
