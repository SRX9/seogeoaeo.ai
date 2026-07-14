"use client";

import { Button, Card, ProgressBar, Skeleton } from "@heroui/react";
import { LineChart } from "@heroui-pro/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type ComponentType, type SVGProps } from "react";
import {
  ActivityIcon,
  ArrowRightIcon,
  ArticlesIcon,
  ChartBarIcon,
  InsightIcon,
  OrderedListIcon,
} from "@/components/icons";
import { MetricCardIcon } from "@/components/ui/metric-card-icon";
import { ToneText } from "@/components/ui/status-text";
import {
  queryKeys,
  useSetupInProgress,
  useVisibilitySummary,
  useVisibilityTraffic,
  type VisibilitySubScoreKey,
  type VisibilitySummary,
  type VisibilityTraffic,
} from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { cn } from "@/lib/cn";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const PILLARS: Array<{ key: VisibilitySubScoreKey; label: string }> = [
  { key: "technical", label: "Technical" },
  { key: "eeat", label: "Content" },
  { key: "brand", label: "Authority" },
  { key: "citability", label: "Citability" },
  { key: "platform", label: "Answers" },
  { key: "schema", label: "Schema" },
];

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function clampScore(score: number | null | undefined) {
  return Math.max(0, Math.min(100, score ?? 0));
}

function scoreMessage(score: number | null | undefined) {
  if (score == null) return "Awaiting First Audit";
  if (score >= 85) return "Excellent Visibility";
  if (score >= 65) return "Strong Foundation";
  if (score >= 45) return "Building Momentum";
  return "Needs Attention";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Latest audit";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Latest audit" : DATE_FORMATTER.format(date);
}

function ScoreCard({ summary }: { summary: VisibilitySummary }) {
  const score = summary.latest?.overall;
  const delta =
    score != null && summary.previousOverall != null
      ? Math.round(score - summary.previousOverall)
      : null;

  return (
    <Card className="min-h-64">
      <Card.Header className="gap-1">
        <Card.Title>Visibility Score</Card.Title>
        <Card.Description>Your latest all-channel visibility baseline.</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-1 flex-col justify-between gap-8">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="flex items-end gap-2">
              <strong className="text-5xl font-semibold leading-none tracking-tighter tabular-nums">
                {score == null ? "—" : Math.round(score)}
              </strong>
              <span className="pb-1 text-sm text-muted">/ 100</span>
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">{scoreMessage(score)}</p>
          </div>
          <ToneText tone={delta != null && delta < 0 ? "danger" : "success"} className="tabular-nums">
            {delta == null ? "First reading" : `${delta >= 0 ? "+" : ""}${delta} points`}
          </ToneText>
        </div>
        <ProgressBar aria-label="Visibility score" value={clampScore(score)} size="sm">
          <ProgressBar.Track>
            <ProgressBar.Fill />
          </ProgressBar.Track>
        </ProgressBar>
      </Card.Content>
      <Card.Footer className="justify-between text-sm text-muted">
        <span>Benchmark</span>
        <strong className="font-medium text-foreground tabular-nums">
          {summary.baseline.baseline == null ? "—" : Math.round(summary.baseline.baseline)}
        </strong>
      </Card.Footer>
    </Card>
  );
}

function PillarScores({ summary }: { summary: VisibilitySummary }) {
  return (
    <Card>
      <Card.Header className="gap-1">
        <Card.Title>Score Breakdown</Card.Title>
        <Card.Description>Signals that shape your overall score.</Card.Description>
      </Card.Header>
      <Card.Content className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {PILLARS.map((pillar) => {
          const value = summary.latest?.subScores[pillar.key];
          return (
            <ProgressBar key={pillar.key} value={clampScore(value)} size="sm">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">{pillar.label}</span>
                <strong className="font-medium text-foreground tabular-nums">
                  {value == null ? "—" : Math.round(value)}
                </strong>
              </div>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          );
        })}
      </Card.Content>
    </Card>
  );
}

function SearchPerformanceCard({ traffic }: { traffic: VisibilityTraffic }) {
  const chartData = traffic.gsc.slice(-14).map((row) => ({
    date: DATE_FORMATTER.format(new Date(`${row.date}T00:00:00Z`)),
    clicks: row.clicks,
  }));
  const clicks = chartData.reduce((total, row) => total + row.clicks, 0);
  const isWaitingForData = traffic.connected.gsc && chartData.length === 0;

  if (!traffic.connected.gsc || isWaitingForData) {
    return (
      <Card
        aria-labelledby="search-performance-title"
        className="relative min-w-0 overflow-hidden bg-[linear-gradient(135deg,var(--accent-soft),var(--surface)_48%)] p-0"
      >
        <Card.Content className="relative min-h-64 overflow-hidden p-5 sm:p-6">
          <div className="relative z-10 max-w-xl pr-10">
            <ToneText tone={isWaitingForData ? "success" : "accent"} className="block text-sm">
              {isWaitingForData ? "Search Console connected" : "Search performance"}
            </ToneText>
            <h2
              id="search-performance-title"
              className="mt-3 text-xl font-semibold leading-[1.15] tracking-tight text-foreground text-balance sm:text-2xl"
            >
              {isWaitingForData ? "Waiting for the first search sync" : "Connect Search Console"}
            </h2>
            <p className="mt-2 max-w-[54ch] text-sm leading-6 text-muted text-pretty">
              {isWaitingForData
                ? "Your organic search trend will appear as soon as Google sends the first reading."
                : "See the organic clicks that bring people to your site, measured directly from Google."}
            </p>
            {!isWaitingForData ? (
              <Link
                href="/settings?tab=integrations"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "group mt-5 min-h-11 gap-2 pl-4 pr-3.5 sm:min-h-9",
                )}
              >
                Connect Search Console
                <ArrowRightIcon
                  className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ) : null}
          </div>
          <MetricCardIcon>
            <ChartBarIcon />
          </MetricCardIcon>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card
      aria-labelledby="search-performance-title"
      className="relative min-w-0 overflow-hidden bg-[linear-gradient(135deg,var(--accent-soft),var(--surface)_48%)] p-0"
    >
      <Card.Content className="grid min-h-full grid-cols-1 md:grid-cols-[minmax(16rem,0.42fr)_minmax(0,1fr)]">
        <div className="relative min-w-0 overflow-hidden p-5 sm:p-6">
          <div className="relative z-10 pr-10">
            <ToneText tone="accent" className="block text-sm">
              Search performance
            </ToneText>
            <h2
              id="search-performance-title"
              className="mt-3 text-2xl font-semibold leading-[1.1] tracking-[-0.025em] text-foreground text-balance sm:text-3xl"
            >
              <span className="tabular-nums">{clicks.toLocaleString()}</span> organic clicks
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">Last 14 recorded days.</p>
          </div>
          <MetricCardIcon>
            <ChartBarIcon />
          </MetricCardIcon>
        </div>

        <div
          className="min-w-0 border-t border-separator/70 bg-surface-secondary/45 p-5 md:border-s md:border-t-0 sm:p-6"
          aria-label="Organic click trend"
        >
          {chartData.length > 1 ? (
            <LineChart data={chartData} height={196}>
              <LineChart.Grid vertical={false} />
              <LineChart.XAxis dataKey="date" tickMargin={8} />
              <LineChart.YAxis width={34} />
              <LineChart.Line
                dataKey="clicks"
                dot={false}
                name="Clicks"
                stroke="var(--accent)"
                strokeWidth={2}
                type="linear"
              />
              <LineChart.Tooltip content={<LineChart.TooltipContent />} />
            </LineChart>
          ) : (
            <div className="grid h-[196px] place-items-center px-6 text-center text-sm leading-6 text-muted text-pretty">
              One reading recorded. The trend will appear after the next sync.
            </div>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

function ActionLink({ href, label, icon: Icon }: { href: string; label: string; icon: IconComponent }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start gap-3")}>
      <Icon className="size-4 text-muted" aria-hidden />
      <span>{label}</span>
      <ArrowRightIcon className="ml-auto size-4 text-muted" aria-hidden />
    </Link>
  );
}

type EvidenceEvent = { label: string; meta: string; positive?: boolean };

function evidenceEvents(summary: VisibilitySummary, traffic: VisibilityTraffic | undefined): EvidenceEvent[] {
  const latest = summary.latest;
  if (!latest) {
    return [
      { label: "Run your first visibility audit", meta: "Ready when you are" },
      { label: "Technical signals will appear here", meta: "After the audit" },
      { label: "AI answer coverage will be measured", meta: "After the audit" },
    ];
  }

  const completed = formatDate(latest.completedAt);
  const scored = PILLARS.flatMap((pillar) => {
    const value = latest.subScores[pillar.key];
    return value == null ? [] : [{ label: pillar.label, value }];
  });
  const strongest = scored.sort((a, b) => b.value - a.value)[0];
  const latestGsc = traffic?.gsc.at(-1);
  const referralTotal = traffic?.aiReferrals.reduce(
    (total, row) => total + Object.values(row.byEngine).reduce((sum, value) => sum + value, 0),
    0,
  );

  return [
    latestGsc
      ? { label: `${latestGsc.clicks.toLocaleString()} search clicks recorded`, meta: latestGsc.date, positive: true }
      : { label: "Visibility baseline recorded", meta: completed, positive: true },
    strongest
      ? { label: `${strongest.label} leads at ${Math.round(strongest.value)}`, meta: completed, positive: true }
      : { label: "Pillar scores recorded", meta: completed },
    referralTotal != null && referralTotal > 0
      ? { label: `${referralTotal.toLocaleString()} AI-referral sessions`, meta: "Connected analytics", positive: true }
      : { label: "AI answer coverage checked", meta: completed },
  ];
}

function EvidenceTrace({ summary, traffic }: { summary: VisibilitySummary; traffic: VisibilityTraffic | undefined }) {
  const events = evidenceEvents(summary, traffic);
  return (
    <Card>
      <Card.Header className="gap-1">
        <div className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted" aria-hidden />
          <Card.Title>Evidence</Card.Title>
        </div>
        <Card.Description>Recent signals behind the score.</Card.Description>
      </Card.Header>
      <Card.Content>
        <ol className="grid gap-4 md:grid-cols-3">
          {events.map((event) => (
            <li key={event.label} className="rounded-xl bg-surface-secondary p-4">
              <div className="mb-3 size-2 rounded-full bg-accent" aria-hidden />
              <p className="text-sm font-medium text-foreground">{event.label}</p>
              <p className="mt-1 text-xs text-muted">{event.meta}</p>
            </li>
          ))}
        </ol>
      </Card.Content>
    </Card>
  );
}

function ScorecardSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" aria-label="Loading visibility scorecard">
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

function SearchPerformanceSkeleton() {
  return <Skeleton className="h-64 rounded-2xl" aria-label="Loading search performance" />;
}

export default function VisibilityPage() {
  const summary = useVisibilitySummary();
  const traffic = useVisibilityTraffic();
  const queryClient = useQueryClient();
  const settingUp = useSetupInProgress();
  const [notice, setNotice] = useState<string | null>(null);

  const runAudit = useMutation({
    mutationFn: async () => {
      setNotice(null);
      const response = await fetch("/api/visibility/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => ({}))) as { auditId?: string; error?: string };
      if (!response.ok) {
        if (response.status === 402) throw new Error("You need more credits to run this audit.");
        throw new Error(body.error ?? "Failed to start the audit.");
      }
      return body.auditId;
    },
    onSuccess: () => {
      setNotice("Audit started. Claudia will refresh this page when it is complete.");
      window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: queryKeys.visibilitySummary }), 4000);
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Failed to start the audit."),
  });

  const latestReportHref = summary.data?.latest ? `/visibility/${summary.data.latest.id}` : "/reports";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="sr-only">Visibility</h1>
          <p className="max-w-2xl text-sm text-muted">Track search readiness, authority, and AI answer coverage.</p>
        </div>
        <Button isPending={runAudit.isPending} isDisabled={settingUp} onPress={() => runAudit.mutate()}>
          <InsightIcon className="size-4" aria-hidden />
          {runAudit.isPending ? "Starting Audit" : `Run Audit · ${CREDIT_COSTS.visibility_audit} cr`}
        </Button>
      </header>

      {notice ? <p className="rounded-xl bg-surface-secondary px-4 py-3 text-sm text-foreground" role="status">{notice}</p> : null}
      {summary.isPending ? <ScorecardSkeleton /> : null}
      {summary.isError ? (
        <Card>
          <Card.Header><Card.Title>Couldn’t Load Visibility</Card.Title><Card.Description>{summary.error instanceof Error ? summary.error.message : "Please try again."}</Card.Description></Card.Header>
          <Card.Footer><Button variant="secondary" onPress={() => void summary.refetch()}>Try Again</Button></Card.Footer>
        </Card>
      ) : null}

      {summary.data ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <ScoreCard summary={summary.data} />
          <PillarScores summary={summary.data} />
        </div>
      ) : null}

      {traffic.isPending ? <SearchPerformanceSkeleton /> : null}
      {traffic.isError ? (
        <Card>
          <Card.Header>
            <Card.Title>Search performance is unavailable</Card.Title>
            <Card.Description>
              {traffic.error instanceof Error ? traffic.error.message : "Please try again."}
            </Card.Description>
          </Card.Header>
          <Card.Footer>
            <Button variant="secondary" onPress={() => void traffic.refetch()}>
              Try Again
            </Button>
          </Card.Footer>
        </Card>
      ) : null}
      {traffic.data ? <SearchPerformanceCard traffic={traffic.data} /> : null}

      {summary.data ? (
        <>
          <Card>
            <Card.Content>
              <nav className="grid gap-2 sm:grid-cols-3" aria-label="Visibility tools">
                <ActionLink href="/visibility/fixes" label="Fix Queue" icon={OrderedListIcon} />
                <ActionLink href="/visibility/answers" label="AI Answers" icon={InsightIcon} />
                <ActionLink href={latestReportHref} label="Latest Report" icon={ArticlesIcon} />
              </nav>
            </Card.Content>
          </Card>
          <EvidenceTrace summary={summary.data} traffic={traffic.data} />
        </>
      ) : null}
    </main>
  );
}
