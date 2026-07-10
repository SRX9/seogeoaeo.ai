import { Card } from "@heroui/react/card";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import type {
  VisibilityAnswers,
  VisibilitySummary,
  VisibilityTraffic,
} from "@/lib/api/queries";

/**
 * AP3 §3.1 — "Is it working?": the three proof-stack numbers side by side.
 * Visibility score + delta, answer share, and real traffic vs baseline. Each
 * slot deep-links to its page; a score is never shown bare (delta + context
 * always ride along). Until GSC is connected the third slot IS the unlock card.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 28;

function Delta({ value, suffix }: { value: number; suffix: string }) {
  if (value === 0) return <span className="text-muted">holding steady</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        value > 0 ? "text-success" : "text-danger",
      )}
    >
      {value > 0 ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />}
      {Math.abs(value)} {suffix}
    </span>
  );
}

function Slot({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="surface-interactive group flex flex-col gap-1 rounded-xl p-4"
    >
      <span className="inline-flex items-center gap-1 text-sm font-medium tracking-[0.01em] text-muted">
        {label}
        <ChevronRightIcon className="size-3 opacity-0 transition-opacity duration-snappy ease-out-strong group-hover-fine:opacity-100" />
      </span>
      {children}
    </Link>
  );
}

/** Sum of clicks over the trailing window vs the window before it. */
function clicksWindows(gsc: VisibilityTraffic["gsc"]): { current: number; previous: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_DAYS * DAY_MS;
  const previousStart = now - 2 * WINDOW_DAYS * DAY_MS;
  let current = 0;
  let previous = 0;
  for (const day of gsc) {
    const at = new Date(day.date).getTime();
    if (at >= windowStart) current += day.clicks;
    else if (at >= previousStart) previous += day.clicks;
  }
  return { current, previous };
}

export function ProofStrip({
  summary,
  answers,
  traffic,
}: {
  summary: VisibilitySummary;
  answers: VisibilityAnswers;
  traffic: VisibilityTraffic;
}) {
  const overall = summary.latest?.overall ?? null;
  const scoreDelta =
    overall != null && summary.previousOverall != null
      ? Math.round(overall - summary.previousOverall)
      : null;

  // Share of AI answers across every engine × tracked prompt in the last check.
  const answerSlots = answers.share.reduce((sum, row) => sum + row.prompts, 0);
  const appeared = answers.share.reduce((sum, row) => sum + row.appeared, 0);

  const gscConnected = traffic.connected.gsc;
  const clicks = gscConnected ? clicksWindows(traffic.gsc) : null;

  return (
    <Card className="material-panel p-2">
      <div className="grid divide-y divide-border/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Slot href={summary.latest ? `/visibility/${summary.latest.id}` : "/visibility"} label="Visibility score">
          {summary.hasAudit && overall != null ? (
            <>
              <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                {Math.round(overall)}
                <span className="text-base font-normal text-muted"> / 100</span>
              </span>
              <span className="text-sm">
                {scoreDelta != null ? (
                  <Delta value={scoreDelta} suffix="vs last audit" />
                ) : (
                  <span className="text-muted">first reading</span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl font-semibold text-default-400">—</span>
              <span className="text-sm text-muted">First audit runs during setup</span>
            </>
          )}
        </Slot>

        <Slot href="/visibility/answers" label="AI answers">
          {answerSlots > 0 ? (
            <>
              <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                {appeared}
                <span className="text-base font-normal text-muted"> of {answerSlots}</span>
              </span>
              <span className="text-sm text-muted">
                answers mention you across ChatGPT, Perplexity &amp; Gemini
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl font-semibold text-default-400">—</span>
              <span className="text-sm text-muted">
                First answer check runs during setup
              </span>
            </>
          )}
        </Slot>

        {gscConnected && clicks ? (
          <Slot href="/visibility" label="Search clicks">
            <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {clicks.current.toLocaleString()}
            </span>
            <span className="text-sm">
              {clicks.previous > 0 ? (
                <Delta
                  value={clicks.current - clicks.previous}
                  suffix={`vs prior ${WINDOW_DAYS} days`}
                />
              ) : (
                <span className="text-muted">last {WINDOW_DAYS} days</span>
              )}
            </span>
          </Slot>
        ) : (
          // The unlock card IS the third slot until GSC connects.
          <Slot href="/settings?tab=integrations" label="Real traffic">
            <span className="text-base font-medium text-foreground">Connect Search Console</span>
            <span className="text-sm text-muted">
              I&apos;ll show your real clicks here and find the queries you already almost rank for.
            </span>
          </Slot>
        )}
      </div>
    </Card>
  );
}
