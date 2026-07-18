"use client";

import { Card, ProgressBar, Skeleton } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "@/components/feedback/section";
import {
  ArrowRightIcon,
  ArticlesIcon,
  ChartBarIcon,
  GaugeIcon,
  InsightIcon,
  SearchIcon,
} from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ToneText } from "@/components/ui/status-text";
import {
  combineQueries,
  useArticles,
  useReports,
  useSiteHealth,
  useVisibilityAnswers,
  useVisibilitySummary,
  useVisibilityTraffic,
} from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import {
  buildResultsOverview,
  type ResultAreaId,
  type ResultAreaView,
  type ResultsOverviewView,
} from "@/lib/results/overview";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const AREA_ICONS: Record<ResultAreaId, ReactNode> = {
  google: <SearchIcon className="size-5" />,
  ai: <InsightIcon className="size-5" />,
  content: <ArticlesIcon className="size-5" />,
  health: <GaugeIcon className="size-5" />,
};

function toneFor(area: ResultAreaView) {
  if (area.tone === "positive") return "success" as const;
  if (area.tone === "attention") return "danger" as const;
  return "default" as const;
}

function ResultArea({ area }: { area: ResultAreaView }) {
  return (
    <Card id={`${area.id}-discovery`} className="scroll-mt-24 rounded-3xl p-0">
      <Card.Header className="flex-row items-start gap-4 p-5 pb-3 sm:p-6 sm:pb-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
          aria-hidden
        >
          {AREA_ICONS[area.id]}
        </span>
        <div className="min-w-0">
          <Card.Title>{area.title}</Card.Title>
          <ToneText tone={toneFor(area)} className="mt-2 block text-2xl font-semibold tracking-tight">
            {area.value}
          </ToneText>
        </div>
      </Card.Header>
      <Card.Content className="flex flex-1 flex-col gap-5 px-5 pb-5 sm:px-6 sm:pb-6">
        <p className="text-sm leading-6 text-muted">{area.change}</p>
        <div className="mt-auto border-t border-separator pt-4">
          <p className="text-xs font-medium text-foreground">What Claudia will do next</p>
          <p className="mt-1 text-sm leading-6 text-muted">{area.nextStep}</p>
        </div>
      </Card.Content>
      {area.href.startsWith("#") ? null : (
        <Card.Footer className="justify-end px-5 pb-5 sm:px-6 sm:pb-6">
          <Link
            href={area.href}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "min-h-10 gap-2 transition-transform active:scale-[0.96]",
            )}
          >
            See details
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </Card.Footer>
      )}
    </Card>
  );
}

function DiscoveryHealth({ view }: { view: ResultsOverviewView["discoveryHealth"] }) {
  return (
    <Card className="rounded-3xl p-0">
      <Card.Header className="flex-row items-start gap-4 p-5 sm:p-6">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
          aria-hidden
        >
          <ChartBarIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Card.Title>Online discovery health</Card.Title>
          <Card.Description className="mt-1 max-w-2xl leading-6">{view.description}</Card.Description>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{view.value}</p>
          {view.delta ? <p className="mt-1 max-w-36 text-xs text-muted">{view.delta}</p> : null}
        </div>
      </Card.Header>
      <Card.Content className="px-5 pb-5 sm:px-6 sm:pb-6">
        <details className="group border-t border-separator pt-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-focus">
            See score details
          </summary>
          <div className="grid gap-x-8 gap-y-5 pb-5 pt-3 sm:grid-cols-2">
            {view.details.map((detail) => (
              <ProgressBar
                key={detail.key}
                aria-label={`${detail.label} score`}
                value={detail.value ?? 0}
                size="sm"
              >
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{detail.label}</span>
                  <strong className="font-medium text-foreground tabular-nums">
                    {detail.value == null ? "—" : Math.round(detail.value)}
                  </strong>
                </div>
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
            ))}
          </div>
          <Link
            href={view.href}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-h-10 transition-transform active:scale-[0.96]",
            )}
          >
            Open advanced audit details
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </details>
      </Card.Content>
    </Card>
  );
}

function WeeklySummaries({ view }: { view: ResultsOverviewView }) {
  return (
    <Card className="rounded-3xl p-0">
      <Card.Header className="p-5 pb-3 sm:p-6 sm:pb-3">
        <Card.Title>Weekly summaries</Card.Title>
        <Card.Description>Claudia’s plain-language record of what changed and what comes next.</Card.Description>
      </Card.Header>
      <Card.Content className="px-5 pb-5 sm:px-6 sm:pb-6">
        {view.latestReport ? (
          <div>
            <time className="text-xs text-muted" dateTime={view.latestReport.createdAt}>
              {DATE_FORMATTER.format(new Date(view.latestReport.createdAt))}
            </time>
            <h2 className="mt-2 text-lg font-semibold text-foreground">{view.latestReport.subject}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{view.latestReport.summary}</p>
            <Link
              href={view.latestReport.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "mt-3 min-h-10 gap-2 transition-transform active:scale-[0.96]",
              )}
            >
              Read latest summary
              <ArrowRightIcon className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted">
            Your first summary arrives after Claudia has a full week of reliable work and measurements.
          </p>
        )}

        {view.recentReports.length > 0 ? (
          <div className="mt-5 divide-y divide-separator border-t border-separator">
            {view.recentReports.map((report) => (
              <Link
                key={report.id}
                href={report.href}
                className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm text-foreground outline-none hover-fine:text-accent focus-visible:ring-2 focus-visible:ring-focus"
              >
                <span className="truncate">{report.subject}</span>
                <time className="shrink-0 text-xs text-muted" dateTime={report.weekStart}>
                  {DATE_FORMATTER.format(new Date(`${report.weekStart}T00:00:00Z`))}
                </time>
              </Link>
            ))}
          </div>
        ) : null}
      </Card.Content>
      <Card.Footer className="justify-end px-5 pb-5 sm:px-6 sm:pb-6">
        <Link
          href="/reports"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "min-h-10 transition-transform active:scale-[0.96]",
          )}
        >
          See all weekly summaries
        </Link>
      </Card.Footer>
    </Card>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading results">
      <Skeleton className="h-52 rounded-3xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-64 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-3xl" />
    </div>
  );
}

function ResultsContent({ view }: { view: ResultsOverviewView }) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-3xl bg-[linear-gradient(135deg,var(--accent-soft),var(--surface)_55%)] p-0">
        <Card.Content className="p-6 sm:p-8">
          <ToneText tone="accent" className="text-sm">This week</ToneText>
          <h2 className="mt-3 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-foreground text-balance sm:text-3xl">
            {view.weeklyHeadline}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{view.weeklySummary}</p>
          <p className="mt-6 text-xs text-muted">{view.measurementFreshness}</p>
        </Card.Content>
      </Card>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Discovery results">
        {view.areas.map((area) => (
          <ResultArea key={area.id} area={area} />
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <DiscoveryHealth view={view.discoveryHealth} />
        <WeeklySummaries view={view} />
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const summary = useVisibilitySummary();
  const traffic = useVisibilityTraffic();
  const answers = useVisibilityAnswers();
  const siteHealth = useSiteHealth();
  const articles = useArticles();
  const reports = useReports();
  const results = combineQueries(summary, traffic, answers, siteHealth, articles, reports);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Results"
        description="See how search discovery, AI answers, content, and website health are changing—and what Claudia will do next."
      />
      <Section query={results} skeleton={<ResultsSkeleton />} errorLabel="Couldn't load your results.">
        {([summaryData, trafficData, answersData, healthData, articleData, reportData]) => (
          <ResultsContent
            view={buildResultsOverview({
              summary: summaryData,
              traffic: trafficData,
              answers: answersData,
              siteHealth: healthData,
              articles: articleData.articles,
              reports: reportData.reports,
            })}
          />
        )}
      </Section>
    </main>
  );
}
