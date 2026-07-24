"use client";

import {
  Breadcrumbs,
  Button,
  Card,
  Link as HeroLink,
  ProgressBar,
  Skeleton,
} from "@heroui/react";
import { BarChart } from "@heroui-pro/react";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Section } from "@/components/feedback/section";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  ArticlesIcon,
  ChartBarIcon,
  GaugeIcon,
  InsightIcon,
  TrendingUpIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCardIcon } from "@/components/ui/metric-card-icon";
import { useReport } from "@/lib/api/queries";

const DAY_MS = 24 * 60 * 60 * 1000;

const dateRangeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const yearFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  timeZone: "UTC",
});

const evidenceDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("en-US");

type AnswerShareRow = { engine: string; appeared: number; prompts: number };

function toUtcDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

function weekRange(value: string) {
  const start = toUtcDate(value);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return `${dateRangeFormatter.format(start)} – ${dateRangeFormatter.format(end)}, ${yearFormatter.format(end)}`;
}

function previousWeekRange(value: string) {
  const start = new Date(toUtcDate(value).getTime() - 7 * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return `${dateRangeFormatter.format(start)} – ${dateRangeFormatter.format(end)}, ${yearFormatter.format(end)}`;
}

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function signedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function answerSharePercent(rows: AnswerShareRow[]) {
  const totals = rows.reduce(
    (result, row) => ({
      appeared: result.appeared + row.appeared,
      prompts: result.prompts + row.prompts,
    }),
    { appeared: 0, prompts: 0 },
  );
  return totals.prompts ? Math.round((totals.appeared / totals.prompts) * 100) : null;
}

function shareFor(row: AnswerShareRow) {
  return row.prompts ? Math.round((row.appeared / row.prompts) * 100) : 0;
}

function engineLabel(engine: string) {
  const normalized = engine.toLowerCase();
  if (normalized === "chatgpt") return "ChatGPT";
  if (normalized === "perplexity") return "Perplexity";
  if (normalized === "gemini") return "Gemini";
  if (normalized === "google_ai") return "Google AI";
  return engine.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metricColor(value: number | null | undefined) {
  if (value == null || value === 0) return "default" as const;
  return value > 0 ? ("success" as const) : ("danger" as const);
}

function progressColor(value: number) {
  if (value >= 70) return "success" as const;
  if (value >= 40) return "warning" as const;
  return "danger" as const;
}

function MetricCard({
  label,
  value,
  delta,
  comparison,
  icon,
}: {
  label: string;
  value: ReactNode;
  delta?: number | null;
  comparison: string;
  icon: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <Card.Content className="relative p-5">
        <div className="relative z-10 min-w-0 pr-10">
          <p className="font-title text-sm text-muted">{label}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums">{value}</p>
            {delta != null && delta !== 0 ? (
              <ToneText tone={metricColor(delta)} className="text-xs tabular-nums">
                {signedNumber(delta)}
              </ToneText>
            ) : null}
          </div>
          <p className="mt-3 truncate text-xs text-muted">vs {comparison}</p>
        </div>
        <MetricCardIcon>{icon}</MetricCardIcon>
      </Card.Content>
    </Card>
  );
}

function EvidenceLink({
  title,
  href,
  date,
}: {
  title: string;
  href?: string | null;
  date: string;
}) {
  const content = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center text-muted">
        <ArticlesIcon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-xs text-muted">Evidence · {date}</span>
      </span>
      {href ? <ArrowRightIcon className="size-4 shrink-0 text-muted" aria-hidden /> : null}
    </>
  );

  return href ? (
    <HeroLink
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-5 flex items-center gap-3 rounded-xl bg-surface-secondary p-3 no-underline hover:bg-surface-tertiary"
    >
      {content}
    </HeroLink>
  ) : (
    <div className="mt-5 flex items-center gap-3 rounded-xl bg-surface-secondary p-3">
      {content}
    </div>
  );
}

function StoryIntro({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-accent tabular-nums">{number}</span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4 max-w-2xl space-y-3 text-sm leading-6 text-muted">{children}</div>
    </div>
  );
}

function AnswerShareCard({ rows, overall }: { rows: AnswerShareRow[]; overall: number | null }) {
  const chartData =
    rows.length > 0
      ? rows.slice(0, 7).map((row) => ({ engine: engineLabel(row.engine), share: shareFor(row) }))
      : [{ engine: "Overall", share: overall ?? 0 }];

  return (
    <Card>
      <Card.Header className="p-5 pb-2 sm:p-6 sm:pb-2">
        <Card.Title>Answer Share by Engine</Card.Title>
        <Card.Description>Share of tracked answers where your brand appeared.</Card.Description>
      </Card.Header>
      <Card.Content className="px-3 pb-4 sm:px-5 sm:pb-5">
        <BarChart data={chartData} height={240}>
          <BarChart.Grid vertical={false} />
          <BarChart.XAxis dataKey="engine" tickMargin={8} />
          <BarChart.YAxis tickFormatter={(value: number) => `${value}%`} width={36} />
          <BarChart.Bar
            barSize={24}
            dataKey="share"
            fill="var(--accent)"
            name="Answer share"
            radius={[6, 6, 0, 0]}
          />
          <BarChart.Tooltip
            content={<BarChart.TooltipContent valueFormatter={(value) => `${value}%`} />}
          />
        </BarChart>
      </Card.Content>
    </Card>
  );
}

function EngineCard({ rows }: { rows: AnswerShareRow[] }) {
  const ordered = [...rows].sort((a, b) => b.appeared - a.appeared).slice(0, 5);
  const total = ordered.reduce((sum, row) => sum + row.appeared, 0);

  return (
    <Card>
      <Card.Header className="flex-row items-start justify-between gap-4 p-5 pb-2 sm:p-6 sm:pb-2">
        <div>
          <Card.Title>Top Engines</Card.Title>
          <Card.Description>Answer mentions by source.</Card.Description>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Mentions</p>
          <p className="mt-1 text-xl font-semibold leading-none tabular-nums">{formatNumber(total)}</p>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4 p-5 sm:p-6">
        {ordered.length > 0 ? (
          ordered.map((row) => {
            const share = shareFor(row);
            return (
              <div key={row.engine}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{engineLabel(row.engine)}</p>
                    <p className="mt-1 text-xs text-muted tabular-nums">
                      {row.appeared} of {row.prompts} tracked answers
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{share}%</span>
                </div>
                <ProgressBar
                  aria-label={`${engineLabel(row.engine)} answer share`}
                  className="mt-2"
                  color={progressColor(share)}
                  size="sm"
                  value={share}
                >
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              </div>
            );
          })
        ) : (
          <p className="text-sm leading-6 text-muted">
            Answer tracking is gathering the first set of engine evidence.
          </p>
        )}
      </Card.Content>
    </Card>
  );
}

function NextDirectionCard({
  items,
  ask,
}: {
  items: Array<{ title: string; thesis: string | null }>;
  ask: { what: string; href: string } | null;
}) {
  return (
    <Card>
      <Card.Header className="p-5 pb-2 sm:p-6 sm:pb-2">
        <Card.Title>Next Direction</Card.Title>
        <Card.Description>{"The highest-value work selected from this week's evidence."}</Card.Description>
      </Card.Header>
      <Card.Content className="p-5 sm:p-6">
        {items.length > 0 ? (
          <ol className="space-y-4">
            {items.slice(0, 3).map((item, index) => (
              <li key={item.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                <span className="text-xs font-medium text-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.thesis ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.thesis}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm leading-6 text-muted">
            The next task will be chosen from the freshest visibility and traffic evidence.
          </p>
        )}

        {ask ? (
          <HeroLink
            href={ask.href}
            className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-accent-soft p-4 text-accent-soft-foreground no-underline"
          >
            <span className="min-w-0">
              <span className="block text-xs font-medium">One thing from you</span>
              <span className="mt-1 block text-sm">{ask.what}</span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0" aria-hidden />
          </HeroLink>
        ) : (
          <div className="mt-5 rounded-xl bg-success-soft p-4 text-sm text-success-soft-foreground">
            Nothing is needed from you this week.
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading recurring report">
      <div className="space-y-3">
        <Skeleton className="h-5 w-52 rounded-lg" />
        <Skeleton className="h-10 w-4/5 rounded-xl" />
        <Skeleton className="h-4 w-3/5 rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
        <Skeleton className="h-52 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

function ReportDocument({ data }: { data: NonNullable<ReturnType<typeof useReport>["data"]> }) {
  const { proof, fixes, content, planChanges } = data.story;
  const score = proof.score;
  const answerPercent = answerSharePercent(proof.answerShare);
  const clicks = proof.traffic?.clicks ?? null;
  const clickDelta = proof.traffic ? proof.traffic.clicks - proof.traffic.prevClicks : null;
  const reportDate = evidenceDateFormatter.format(toUtcDate(data.report.weekStart));
  const evidence = content.published[0] ?? null;
  const evidenceTitle = evidence?.title ?? fixes.examples[0] ?? "Weekly visibility evidence review";
  const completed = fixes.applied + fixes.verified + content.published.length;
  const summary =
    answerPercent != null && answerPercent > 0
      ? "Visibility progress, stronger answer coverage, and the evidence-led plan for the week ahead."
      : "A concise view of this week's visibility evidence, completed work, and next direction.";

  return (
    <article className="space-y-8 print:space-y-6">
      <Breadcrumbs className="print:hidden">
        <Breadcrumbs.Item href="/reports" className="no-underline">Reports</Breadcrumbs.Item>
        <Breadcrumbs.Item>Weekly report</Breadcrumbs.Item>
      </Breadcrumbs>

      <PageHeader
        title={data.report.subject}
        description={summary}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-accent">Weekly Report</span>
            <span className="text-sm text-muted">{weekRange(data.report.weekStart)}</span>
          </div>
        }
        actions={
          <Button className="print:hidden" variant="outline" onPress={() => window.print()}>
            <ArrowDownIcon className="size-4" aria-hidden />
            Export PDF
          </Button>
        }
      />

      <section aria-label="Weekly report metrics" className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Visibility"
          value={score?.current ?? "—"}
          delta={score?.delta ?? null}
          comparison={previousWeekRange(data.report.weekStart)}
          icon={<GaugeIcon aria-hidden />}
        />
        <MetricCard
          label="Answer share"
          value={answerPercent == null ? "—" : `${answerPercent}%`}
          comparison={previousWeekRange(data.report.weekStart)}
          icon={<InsightIcon aria-hidden />}
        />
        <MetricCard
          label="Clicks"
          value={clicks == null ? "—" : formatNumber(clicks)}
          delta={clickDelta}
          comparison={previousWeekRange(data.report.weekStart)}
          icon={<ChartBarIcon aria-hidden />}
        />
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
        <StoryIntro number="01" title="Answer Quality Lift">
          <p>
            {answerPercent != null
              ? `Your brand appeared in ${answerPercent}% of tracked answers across ${proof.answerShare.length || 1} AI engine${proof.answerShare.length === 1 ? "" : "s"}.`
              : "Answer tracking is establishing a reliable baseline across the priority engines."}
          </p>
          <p>
            {content.performance[0] ??
              (completed > 0
                ? `${completed} evidence-backed improvement${completed === 1 ? "" : "s"} moved forward during this reporting period.`
                : "Claudia used this period to gather evidence and prepare the next highest-impact work.")}
          </p>
          <EvidenceLink title={evidenceTitle} href={evidence?.externalUrl} date={reportDate} />
        </StoryIntro>
        <AnswerShareCard rows={proof.answerShare} overall={answerPercent} />
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
        <StoryIntro number="02" title="Topic Momentum">
          <p>
            {content.published.length > 0
              ? `${content.published.length} article${content.published.length === 1 ? "" : "s"} expanded coverage around the topics already showing the strongest evidence.`
              : "Coverage is being prioritized around topics with the clearest answer visibility and search opportunity."}
          </p>
          <p>
            {planChanges[0] ??
              (fixes.applied || fixes.verified
                ? `${fixes.applied} site fix${fixes.applied === 1 ? "" : "es"} applied and ${fixes.verified} verified this week.`
                : "The queue remains evidence-led, with weak signals deprioritized before they consume publishing capacity.")}
          </p>
        </StoryIntro>
        <EngineCard rows={proof.answerShare} />
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
        <StoryIntro number="03" title="Next Week's Direction">
          <p>
            The next work is selected from the freshest audit, answer-share, content, and traffic evidence—not a fixed checklist.
          </p>
          {content.performance.slice(1, 3).map((line) => <p key={line}>{line}</p>)}
        </StoryIntro>
        <NextDirectionCard items={content.nextWeek} ask={data.ask} />
      </section>

      <Card className="print:hidden">
        <Card.Content className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm font-semibold">Continue from this evidence</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Open visibility to review the current score, answer evidence, and active fix queue.
            </p>
          </div>
          <HeroLink href="/visibility" className="inline-flex shrink-0 items-center gap-2 no-underline">
            Open visibility
            <TrendingUpIcon className="size-4" aria-hidden />
          </HeroLink>
        </Card.Content>
      </Card>
    </article>
  );
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const report = useReport(params.id);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4 print:max-w-none print:p-0">
      <Section
        query={report}
        skeleton={<ReportSkeleton />}
        errorLabel="Couldn't load this recurring report."
      >
        {(data) => <ReportDocument data={data} />}
      </Section>
    </main>
  );
}
