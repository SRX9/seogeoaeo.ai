"use client";

import type { DataGridColumn } from "@heroui-pro/react";
import { Card, Tabs, buttonVariants } from "@heroui/react";
import { AreaChart, DataGrid, KPI } from "@heroui-pro/react";
import Link from "next/link";
import { useMemo } from "react";
import { ClaudiaHero } from "@/components/dashboard/claudia-hero";
import { ClaudiaWorkPanel } from "@/components/dashboard/claudia-work-panel";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { VisibilitySnapshot } from "@/components/dashboard/visibility-snapshot";
import { Section } from "@/components/feedback/section";
import {
  ArticlesIcon,
  ChevronRightIcon,
  GaugeIcon,
  InboxIcon,
  LaunchIcon,
  RefreshIcon,
  TopicsIcon,
} from "@/components/icons";
import { IconButton } from "@/components/layout/icon-button";
import { useDashboard, type DashboardData } from "@/lib/api/queries";
import type { AgentEventView } from "@/lib/agent/types";
import { cn } from "@/lib/cn";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DashboardToolbar({
  onRefresh,
  isRefreshing,
}: {
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <Tabs.ListContainer className="min-w-0 max-w-full">
        <Tabs.List aria-label="Dashboard sections">
          <Tabs.Tab id="claudia">
            Claudia
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="work">
            Work
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="visibility">
            Visibility
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label="Refresh Claudia"
          size="sm"
          variant="tertiary"
          className="size-11 sm:size-8"
          isDisabled={isRefreshing}
          onPress={onRefresh}
        >
          <RefreshIcon
            className={cn(
              "size-4",
              isRefreshing && "animate-spin motion-reduce:animate-none",
            )}
          />
        </IconButton>
        <Link
          href="/settings"
          className={cn(
            buttonVariants({ size: "sm", variant: "tertiary" }),
            "min-h-11 sm:min-h-8",
          )}
        >
          Settings
        </Link>
        <Link
          href="/reports"
          className={cn(buttonVariants({ size: "sm" }), "min-h-11 sm:min-h-8")}
        >
          View reports
        </Link>
      </div>
    </div>
  );
}

function DashboardKpis({ data }: { data: DashboardData }) {
  const visibility = data.summary.latest?.overall ?? 0;
  const previous = data.summary.previousOverall;
  const visibilityDelta = previous == null ? null : Math.round(visibility - previous);
  const approvalsWaiting = Math.min(data.approvals.length, data.inboxCount);
  const publishedBeforeThisWeek = Math.max(
    0,
    data.automation.articlesPublished - data.automation.thisWeek.articlesPublished,
  );

  const stats = [
    {
      Icon: GaugeIcon,
      chartColor: "var(--chart-3)",
      chartData: [
        { value: previous ?? visibility },
        { value: visibility },
      ],
      chartId: "visibility-score-trend",
      chartSummary:
        previous == null
          ? `Current visibility score is ${visibility}; no previous audit is available.`
          : `Visibility moved from ${previous} to ${visibility}.`,
      href: "/visibility",
      label: "Visibility score",
      value: visibility,
      detail:
        visibilityDelta == null
          ? "First reading"
          : `${visibilityDelta >= 0 ? "+" : ""}${visibilityDelta} from last audit`,
      detailClassName:
        visibilityDelta == null
          ? "text-muted"
          : visibilityDelta >= 0
            ? "text-success"
            : "text-danger",
    },
    {
      Icon: InboxIcon,
      chartColor: "var(--chart-2)",
      chartData: [
        { value: approvalsWaiting },
        { value: data.inboxCount },
      ],
      chartId: "review-workload",
      chartSummary: `${approvalsWaiting} approval requests within ${data.inboxCount} open decisions.`,
      href: "/inbox",
      label: "Needs review",
      value: data.inboxCount,
      detail: data.inboxCount === 1 ? "1 decision waiting" : `${data.inboxCount} decisions waiting`,
      detailClassName: data.inboxCount > 0 ? "text-accent" : "text-muted",
    },
    {
      Icon: ArticlesIcon,
      chartColor: "var(--color-success)",
      chartData: [
        { value: publishedBeforeThisWeek },
        { value: data.automation.articlesPublished },
      ],
      chartId: "published-output",
      chartSummary: `${publishedBeforeThisWeek} articles were published before this week and ${data.automation.articlesPublished} are published in total.`,
      href: "/articles",
      label: "Published articles",
      value: data.automation.articlesPublished,
      detail: `${data.automation.thisWeek.articlesPublished} this week`,
      detailClassName: "text-muted",
    },
    {
      Icon: TopicsIcon,
      chartColor: "var(--chart-4)",
      chartData: [
        { value: data.automation.writtenToday },
        { value: data.automation.pendingTopics },
      ],
      chartId: "topic-workload",
      chartSummary: `${data.automation.writtenToday} articles were written today and ${data.automation.pendingTopics} topics remain queued.`,
      href: "/topics",
      label: "Topics queued",
      value: data.automation.pendingTopics,
      detail: `Up to ${data.automation.dailyCap} written per day`,
      detailClassName: "text-muted",
    },
  ];

  return (
    <section aria-label="Claudia overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <Link
          key={stat.label}
          href={stat.href}
          aria-label={`Open ${stat.label}`}
          className="group block cursor-[var(--cursor-interactive)] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <KPI className="relative min-h-44 overflow-hidden p-5">
            <KPI.Header className="relative z-10 flex-row items-center gap-2 pr-10">
              <stat.Icon className="size-4 shrink-0 text-muted" />
              <KPI.Title className="font-title leading-5">{stat.label}</KPI.Title>
            </KPI.Header>
            <KPI.Content className="relative z-10 mt-3 grid-cols-1 items-start gap-1.5">
              <KPI.Value
                className="text-3xl leading-none tracking-[-0.03em] tabular-nums"
                maximumFractionDigits={0}
                value={stat.value}
              />
              <span className={cn("text-sm leading-5", stat.detailClassName)}>
                {stat.detail}
              </span>
              <span className="sr-only">{stat.chartSummary}</span>
              <div className="mt-2 min-w-0" aria-hidden="true">
                <AreaChart
                  data={stat.chartData}
                  height={48}
                  margin={{ bottom: 0, left: 0, right: 0, top: 2 }}
                >
                  <defs>
                    <linearGradient id={stat.chartId} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={stat.chartColor} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={stat.chartColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <AreaChart.Area
                    dataKey="value"
                    dot={false}
                    fill={`url(#${stat.chartId})`}
                    isAnimationActive={false}
                    stroke={stat.chartColor}
                    strokeWidth={1.5}
                    type="linear"
                  />
                </AreaChart>
              </div>
            </KPI.Content>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-4 grid size-8 scale-[0.25] place-items-center rounded-lg bg-surface-secondary text-foreground opacity-0 blur-[4px] transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] group-hover-fine:scale-100 group-hover-fine:opacity-100 group-hover-fine:blur-0 group-focus-visible:scale-100 group-focus-visible:opacity-100 group-focus-visible:blur-0 motion-reduce:scale-100 motion-reduce:blur-0 motion-reduce:transition-[opacity]"
            >
              <LaunchIcon className="size-4" />
            </span>
          </KPI>
        </Link>
      ))}
    </section>
  );
}

function RecentWorkTable({ events }: { events: AgentEventView[] }) {
  const columns = useMemo<DataGridColumn<AgentEventView>[]>(
    () => [
      {
        accessorKey: "summary",
        cell: (event) => (
          <span className="line-clamp-2 font-medium leading-5 text-foreground" title={event.summary}>
            {event.summary}
          </span>
        ),
        header: "Work item",
        id: "summary",
        isRowHeader: true,
        minWidth: 320,
      },
      {
        accessorKey: "type",
        cell: (event) => <span className="text-muted">{titleCase(event.type)}</span>,
        header: "Type",
        id: "type",
        minWidth: 150,
      },
      {
        accessorKey: "createdAt",
        cell: (event) => (
          <time className="text-muted tabular-nums" dateTime={event.createdAt}>
            {dateTimeFormatter.format(new Date(event.createdAt))}
          </time>
        ),
        header: "Updated",
        id: "createdAt",
        minWidth: 180,
      },
      {
        align: "end",
        cell: (event) =>
          event.artifactRef?.startsWith("/") ? (
            <Link
              href={event.artifactRef}
              className="inline-flex min-h-8 items-center text-sm font-medium text-foreground no-underline"
            >
              Open
            </Link>
          ) : (
            <span className="text-sm text-muted">Recorded</span>
          ),
        header: "Result",
        id: "result",
        minWidth: 100,
      },
    ],
    [],
  );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="recent-work-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="recent-work-title"
            className="text-lg font-semibold tracking-[-0.015em] text-foreground"
          >
            Recent work
          </h2>
          <p className="mt-1 text-sm leading-5 text-muted text-pretty">
            The latest durable events from Claudia.
          </p>
        </div>
        <Link
          href="/activity"
          className="-my-2 inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-medium text-muted no-underline transition-colors duration-150 hover-fine:text-foreground"
        >
          Full activity
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>
      {events.length > 0 ? (
        <DataGrid
          aria-label="Recent work"
          columns={columns}
          contentClassName="min-w-[720px]"
          data={events.slice(0, 8)}
          getRowId={(event) => event.id}
          verticalAlign="middle"
        />
      ) : (
        <Card>
          <Card.Content className="py-12 text-center text-sm leading-6 text-muted text-pretty">
            Recent work will appear here after Claudia completes her first task.
          </Card.Content>
        </Card>
      )}
    </section>
  );
}

function ClaudiaDashboard({ data }: { data: DashboardData }) {
  if (data.setup.run?.status !== "completed") {
    return <ClaudiaHero setup={data.setup} agent={data.agent} integrations={data.integrations} />;
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-7">
      <ClaudiaWorkPanel state={data.agent} />
      <DashboardKpis data={data} />
    </div>
  );
}

export function DashboardPageClient() {
  const dashboard = useDashboard();

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-12 pt-5 lg:pb-14 lg:pt-6">
      <Tabs
        className="w-full"
        defaultSelectedKey="claudia"
        variant="secondary"
      >
        <DashboardToolbar
          isRefreshing={dashboard.isFetching}
          onRefresh={() => void dashboard.refetch()}
        />
        <Tabs.Panel className="pt-6 lg:pt-7" id="claudia">
          <Section
            query={dashboard}
            skeleton={<DashboardLoadingState />}
            errorLabel="Couldn't load Claudia's dashboard."
          >
            {(data) => <ClaudiaDashboard data={data} />}
          </Section>
        </Tabs.Panel>
        <Tabs.Panel className="pt-6 lg:pt-7" id="work">
          <Section
            query={dashboard}
            skeleton={<DashboardLoadingState />}
            errorLabel="Couldn't load Claudia's work."
          >
            {(data) => <RecentWorkTable events={data.agent.recentEvents} />}
          </Section>
        </Tabs.Panel>
        <Tabs.Panel className="pt-6 lg:pt-7" id="visibility">
          <Section
            query={dashboard}
            skeleton={<DashboardLoadingState />}
            errorLabel="Couldn't load visibility details."
          >
            {(data) => <VisibilitySnapshot summary={data.summary} />}
          </Section>
        </Tabs.Panel>
      </Tabs>
    </main>
  );
}
