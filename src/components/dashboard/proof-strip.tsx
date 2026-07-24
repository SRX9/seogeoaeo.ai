import type { ReactNode } from "react";
import { Card } from "@heroui/react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  LinkIcon,
  SearchIcon,
  InsightIcon,
} from "@/components/icons";
import type { AgentEventView } from "@/lib/agent/types";
import type {
  VisibilityAnswers,
  VisibilitySummary,
  VisibilityTraffic,
} from "@/lib/api/queries";
import { cn } from "@/lib/cn";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;

function clicksWindows(gsc: VisibilityTraffic["gsc"]) {
  const now = Date.now();
  const currentStart = now - WINDOW_DAYS * DAY_MS;
  const previousStart = now - 2 * WINDOW_DAYS * DAY_MS;
  let current = 0;
  let previous = 0;
  for (const day of gsc) {
    const at = new Date(day.date).getTime();
    if (at >= currentStart) current += day.clicks;
    else if (at >= previousStart) previous += day.clicks;
  }
  return { current, previous };
}

function MetricDelta({ value, emptyLabel, suffix = "" }: { value: number | null; emptyLabel: string; suffix?: string }) {
  if (value == null) return <span>{emptyLabel}</span>;
  if (value === 0) return <span>Holding Steady</span>;
  return (
    <span className={cn("inline-flex items-center gap-1", value > 0 ? "text-success" : "text-danger")}>
      {value > 0 ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />}
      {Math.abs(value).toLocaleString()}{suffix}
    </span>
  );
}

function Metric({ label, value, detail, href }: { label: string; value: ReactNode; detail: ReactNode; href: string }) {
  return (
    <Link href={href} className="group block min-w-0 rounded-2xl bg-surface-secondary p-5 no-underline outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <span className="text-sm font-medium text-muted">{label}</span>
      <strong className="mt-3 block text-3xl font-semibold leading-none tracking-tight text-foreground tabular-nums">{value}</strong>
      <small className="mt-2 block text-xs leading-5 text-muted group-hover:text-foreground">{detail}</small>
    </Link>
  );
}

function relativeLabel(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function EventIcon({ type }: { type: string }) {
  if (type === "artifact_created") return <LinkIcon className="size-4" />;
  if (type === "completed" || type === "verified") return <CheckIcon className="size-4" />;
  if (type === "discovered") return <SearchIcon className="size-4" />;
  return <InsightIcon className="size-4" />;
}

function RecentWork({ events }: { events: AgentEventView[] }) {
  const visible = events.slice(0, 4);
  return (
    <Card>
      <Card.Header className="flex-row items-start justify-between gap-4">
        <div>
          <Card.Title>Recent Work</Card.Title>
          <Card.Description>Latest completed actions and evidence.</Card.Description>
        </div>
        <Link href="/activity" className="shrink-0 text-sm font-medium text-foreground no-underline">View Log</Link>
      </Card.Header>
      <Card.Content>
        {visible.length ? (
          <div className="space-y-1">
            {visible.map((event) => (
              <div key={event.id} className="flex min-w-0 items-start gap-3 rounded-2xl px-3 py-3">
                <span className="grid size-9 shrink-0 place-items-center text-muted" aria-hidden>
                  <EventIcon type={event.type} />
                </span>
                <p className="min-w-0 flex-1 text-sm leading-6 text-foreground">{event.summary}</p>
                <time className="shrink-0 pt-0.5 text-xs text-muted tabular-nums" dateTime={event.createdAt} suppressHydrationWarning>
                  {relativeLabel(event.createdAt)}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-surface-secondary p-4">
            <InsightIcon className="size-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">No Recorded Work Yet</p>
              <p className="mt-0.5 text-xs text-muted">Completed work will appear here.</p>
            </div>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

export function ProofStrip({
  summary,
  answers,
  traffic,
  events = [],
}: {
  summary: VisibilitySummary;
  answers: VisibilityAnswers;
  traffic: VisibilityTraffic;
  events?: AgentEventView[];
}) {
  const overall = summary.latest?.overall ?? null;
  const scoreDelta = overall != null && summary.previousOverall != null ? Math.round(overall - summary.previousOverall) : null;
  const answerSlots = answers.share.reduce((total, row) => total + row.prompts, 0);
  const appeared = answers.share.reduce((total, row) => total + row.appeared, 0);
  const answerShare = answerSlots > 0 ? Math.round((appeared / answerSlots) * 100) : null;
  const clicks = traffic.connected.gsc ? clicksWindows(traffic.gsc) : null;
  const clickDelta = clicks && clicks.previous > 0 ? Math.round(((clicks.current - clicks.previous) / clicks.previous) * 100) : null;

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]" aria-labelledby="performance-title">
      <Card>
        <Card.Header className="flex-row items-start justify-between gap-4">
          <div>
            <Card.Title id="performance-title">Performance</Card.Title>
            <Card.Description>Your latest visibility and traffic signals.</Card.Description>
          </div>
          <span className="shrink-0 text-xs font-medium text-muted">Last 28 Days</span>
        </Card.Header>
        <Card.Content className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Visibility"
            value={overall != null ? Math.round(overall) : "—"}
            detail={<MetricDelta value={scoreDelta} emptyLabel={overall == null ? "Run First Audit" : "First Benchmark"} />}
            href={summary.latest ? `/visibility/${summary.latest.id}` : "/visibility"}
          />
          <Metric
            label="Answer Share"
            value={answerShare != null ? `${answerShare}%` : "—"}
            detail={answerSlots > 0 ? <span>{appeared} of {answerSlots} Checks</span> : <span>No Checks Yet</span>}
            href="/visibility/answers"
          />
          <Metric
            label="Clicks"
            value={clicks ? clicks.current.toLocaleString() : "—"}
            detail={<MetricDelta value={clickDelta} suffix="%" emptyLabel={traffic.connected.gsc ? "Awaiting Comparison" : "Connect Search Console"} />}
            href={traffic.connected.gsc ? "/visibility" : "/settings?tab=integrations"}
          />
        </Card.Content>
      </Card>
      <RecentWork events={events} />
    </section>
  );
}
