"use client";

import { Card, Label, ListBox, Select, Skeleton } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState } from "@heroui-pro/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChartBarIcon,
  GaugeIcon,
  SearchIcon,
  InsightIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { Section } from "@/components/feedback/section";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCardIcon } from "@/components/ui/metric-card-icon";
import { type WeeklyReportRow, useReports } from "@/lib/api/queries";

type ReportPeriod = "month" | "quarter" | "half-year" | "year" | "all";

const PERIODS: Array<{ value: ReportPeriod; label: string; days: number | null }> = [
  { value: "month", label: "Past month", days: 31 },
  { value: "quarter", label: "Past 3 months", days: 93 },
  { value: "half-year", label: "Past 6 months", days: 186 },
  { value: "year", label: "Past year", days: 366 },
  { value: "all", label: "All time", days: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const rangeStartFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const rangeEndFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function isoDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
}

function weekRange(weekStart: string) {
  const start = isoDate(weekStart);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return `${rangeStartFormatter.format(start)} – ${rangeEndFormatter.format(end)}`;
}

function filterReports(reports: WeeklyReportRow[], period: ReportPeriod) {
  const selected = PERIODS.find((item) => item.value === period);
  if (!selected?.days || reports.length === 0) return reports;

  const newest = isoDate(reports[0].weekStart).getTime();
  const cutoff = newest - selected.days * DAY_MS;
  return reports.filter((report) => isoDate(report.weekStart).getTime() >= cutoff);
}

function signedValue(value: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function reportThemes(report: WeeklyReportRow) {
  const themes: string[] = [];
  if (report.summary.completedWork > 0) themes.push("Priority work");
  if (report.summary.answerMentions > 0) themes.push("AI answer visibility");
  if (report.summary.publishedCount > 0) themes.push("Content expansion");
  if (themes.length === 0) themes.push("Evidence gathering", "Visibility monitoring");
  return themes.slice(0, 3);
}

function ReportMetric({
  icon,
  value,
  label,
  positive,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  positive?: boolean;
}) {
  return (
    <div className="relative min-h-28 min-w-0 overflow-hidden rounded-xl bg-surface-secondary p-4">
      <div className="relative z-10 min-w-0 pr-10">
        <p className={positive ? "text-success" : "text-foreground"}>
          <span className="text-xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        </p>
        <p className="font-title mt-1 text-pretty text-xs leading-5 text-muted">{label}</p>
      </div>
      <MetricCardIcon>{icon}</MetricCardIcon>
    </div>
  );
}

function FeaturedReport({ report }: { report: WeeklyReportRow }) {
  const visibilityValue = report.summary.visibilityChangePercent;
  const hasVisibilityChange = visibilityValue !== null;

  return (
    <Card>
      <Card.Header className="gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-accent">Latest Report</span>
          <time className="text-sm text-muted" dateTime={report.createdAt || report.weekStart}>
            {dateFormatter.format(isoDate(report.createdAt || report.weekStart))}
          </time>
        </div>
        <Card.Title className="max-w-3xl text-balance text-xl sm:text-2xl">
          {report.subject}
        </Card.Title>
        <div className="flex flex-wrap gap-2">
          {reportThemes(report).map((theme) => (
            <span key={theme} className="text-xs font-medium text-muted">
              {theme}
            </span>
          ))}
        </div>
      </Card.Header>
      <Card.Content className="grid gap-3 px-5 sm:grid-cols-3 sm:px-6">
        <ReportMetric
          icon={<GaugeIcon />}
          value={signedValue(report.summary.completedWork)}
          label="Priority work closed"
          positive={report.summary.completedWork > 0}
        />
        <ReportMetric
          icon={<SearchIcon />}
          value={
            hasVisibilityChange
              ? signedValue(visibilityValue, "%")
              : String(report.summary.visibilityScore ?? "—")
          }
          label={hasVisibilityChange ? "Visibility increase" : "Visibility score"}
          positive={hasVisibilityChange ? visibilityValue > 0 : false}
        />
        <ReportMetric
          icon={<InsightIcon />}
          value={signedValue(report.summary.answerMentions)}
          label="AI mentions"
          positive={report.summary.answerMentions > 0}
        />
      </Card.Content>
      <Card.Footer className="justify-end p-5 sm:p-6">
        <Link href={`/reports/${report.id}`} className={buttonVariants({ variant: "primary" })}>
          Read report
          <ArrowRightIcon className="size-4" />
        </Link>
      </Card.Footer>
    </Card>
  );
}

function ReportRow({ report }: { report: WeeklyReportRow }) {
  const delivered = Boolean(report.emailedAt);

  return (
    <Link
      href={`/reports/${report.id}`}
      className="group grid min-h-16 grid-cols-1 items-center gap-2 px-4 py-3 outline-none hover:bg-default focus-visible:ring-2 focus-visible:ring-focus sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-5"
    >
      <time className="text-sm text-muted tabular-nums" dateTime={report.weekStart}>
        {weekRange(report.weekStart)}
      </time>
      <p className="min-w-0 truncate text-sm font-medium text-foreground">{report.subject}</p>
      <ToneText tone={delivered ? "success" : "default"} className="text-xs">
        {delivered ? "Delivered" : "Prepared"}
      </ToneText>
    </Link>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading reports">
      <Card className="p-6">
        <Skeleton className="h-5 w-28 rounded-lg" />
        <Skeleton className="mt-4 h-8 w-2/3 rounded-lg" />
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      </Card>
      <Card className="space-y-2 p-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-xl" />
        ))}
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  const reports = useReports();
  const [period, setPeriod] = useState<ReportPeriod>("year");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Reports"
        description="A weekly record of work completed, visibility movement, and evidence collected."
        actions={
          <Select
            aria-label="Report period"
            className="min-w-44 max-w-52"
            value={period}
            onChange={(key) => setPeriod(key as ReportPeriod)}
          >
            <Label className="sr-only">Report period</Label>
            <Select.Trigger>
              <CalendarIcon className="size-4 text-muted" />
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {PERIODS.map((item) => (
                  <ListBox.Item key={item.value} id={item.value} textValue={item.label}>
                    {item.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        }
        meta={
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <ChartBarIcon className="size-3.5" />
            Weekly Archive
          </span>
        }
      />

      <Section query={reports} skeleton={<ReportsSkeleton />} errorLabel="Couldn't load your reports.">
        {(data) => {
          const visibleReports = filterReports(data.reports, period);
          const [featured, ...archive] = visibleReports;

          if (!featured) {
            return (
              <Card>
                <EmptyState>
                  <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                      <ChartBarIcon className="size-5" />
                    </EmptyState.Media>
                    <EmptyState.Title>No reports yet</EmptyState.Title>
                    <EmptyState.Description className="max-w-md text-pretty">
                      Your first report arrives after Claudia has a full week of work and evidence to summarize.
                    </EmptyState.Description>
                  </EmptyState.Header>
                </EmptyState>
              </Card>
            );
          }

          return (
            <div className="space-y-4">
              <FeaturedReport report={featured} />
              {archive.length > 0 ? (
                <Card className="overflow-hidden p-0">
                  <Card.Header className="p-5 pb-3">
                    <Card.Title>Earlier reports</Card.Title>
                    <Card.Description>Browse your previous weekly summaries.</Card.Description>
                  </Card.Header>
                  <Card.Content className="divide-y divide-separator p-0" aria-label="Earlier reports">
                    {archive.map((report) => (
                      <ReportRow key={report.id} report={report} />
                    ))}
                  </Card.Content>
                </Card>
              ) : null}
            </div>
          );
        }}
      </Section>
    </main>
  );
}
