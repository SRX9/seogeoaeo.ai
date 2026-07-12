import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { AgentEventView } from "@/lib/agent/types";
import type {
  VisibilityAnswers,
  VisibilitySummary,
  VisibilityTraffic,
} from "@/lib/api/queries";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;

function Delta({ value, suffix }: { value: number; suffix: string }) {
  if (value === 0) return <span className="text-muted">Holding steady</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 tabular-nums", value > 0 ? "text-success" : "text-danger")}>
      {value > 0 ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />}
      {Math.abs(value)} {suffix}
    </span>
  );
}

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

function sparklinePoints(values: number[]) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 36 - ((value - min) / range) * 30;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function Metric({
  label,
  value,
  context,
  href,
}: {
  label: string;
  value: React.ReactNode;
  context: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group min-w-0 border-t border-separator/70 py-4 first:border-t-0 sm:border-l sm:border-t-0 sm:px-5 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0"
    >
      <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
        {label}
        <ChevronRightIcon className="size-3 opacity-50 group-hover-fine:opacity-100" />
      </span>
      <div className="mt-3 text-3xl font-semibold leading-none tracking-[-0.03em] text-foreground tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-sm leading-6 text-muted">{context}</div>
    </Link>
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
  const scoreDelta =
    overall != null && summary.previousOverall != null
      ? Math.round(overall - summary.previousOverall)
      : null;
  const answerSlots = answers.share.reduce((total, row) => total + row.prompts, 0);
  const appeared = answers.share.reduce((total, row) => total + row.appeared, 0);
  const answerShare = answerSlots > 0 ? Math.round((appeared / answerSlots) * 100) : null;
  const clicks = traffic.connected.gsc ? clicksWindows(traffic.gsc) : null;
  const trend = traffic.gsc.slice(-24).map((point) => point.clicks);
  const annotations = events
    .filter((event) => ["applied", "verified", "artifact_created", "completed"].includes(event.type))
    .slice(0, 3);

  const headline =
    overall != null
      ? scoreDelta != null && scoreDelta !== 0
        ? `Visibility is ${scoreDelta > 0 ? "up" : "down"} ${Math.abs(scoreDelta)} points since the prior audit`
        : `Visibility is holding at ${Math.round(overall)} while Claudia gathers the next signal`
      : "The first visibility baseline is still being established";

  return (
    <section aria-labelledby="proof-story-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-muted">Outcome story</p>
          <h2 id="proof-story-title" className="mt-2 text-xl font-semibold tracking-[-0.02em] text-foreground sm:text-2xl">
            {headline}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            These signals are shown alongside recorded work. They suggest direction without claiming
            that one action caused every movement.
          </p>
        </div>
        {trend.length > 1 ? (
          <svg
            viewBox="0 0 100 40"
            role="img"
            aria-label="Recent daily search click trend"
            className="h-14 w-full max-w-52 overflow-visible text-accent"
            preserveAspectRatio="none"
          >
            <polyline
              points={sparklinePoints(trend)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </div>

      <div className="mt-6 grid border-y border-separator/70 sm:grid-cols-3">
        <Metric
          label="Visibility score"
          href={summary.latest ? `/visibility/${summary.latest.id}` : "/visibility"}
          value={overall != null ? Math.round(overall) : "No data"}
          context={
            scoreDelta != null ? <Delta value={scoreDelta} suffix="points" /> : "First audit pending"
          }
        />
        <Metric
          label="AI answer share"
          href="/visibility/answers"
          value={answerShare != null ? `${answerShare}%` : "No data"}
          context={answerSlots > 0 ? `${appeared} of ${answerSlots} tracked answers` : "First answer check pending"}
        />
        <Metric
          label="Search clicks"
          href={traffic.connected.gsc ? "/visibility" : "/settings?tab=integrations"}
          value={clicks ? clicks.current.toLocaleString() : "No data"}
          context={
            clicks
              ? clicks.previous > 0
                ? <Delta value={clicks.current - clicks.previous} suffix={`vs prior ${WINDOW_DAYS} days`} />
                : `Last ${WINDOW_DAYS} days`
              : "Connect Search Console for real traffic"
          }
        />
      </div>

      {annotations.length ? (
        <div className="mt-6 flex flex-col gap-3 border-t border-separator/60 pt-5 sm:flex-row">
          {annotations.map((event) => (
            <div key={event.id} className="flex min-w-0 flex-1 items-start gap-2.5">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm text-foreground">{event.summary}</p>
                <time dateTime={event.createdAt} className="mt-1 block text-xs text-muted" suppressHydrationWarning>
                  {new Date(event.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                </time>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
