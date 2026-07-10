import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Meter } from "@heroui/react/meter";
import Link from "next/link";
import type { AgentState, AutomationStats, CreditBalance } from "@/lib/api/queries";
import { cn } from "@/lib/cn";

const DAY_MS = 24 * 60 * 60 * 1000;

function relativeLabel(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const days = Math.round(abs / DAY_MS);
  const hours = Math.round(abs / (60 * 60 * 1000));
  const value =
    days >= 1
      ? `${days} day${days === 1 ? "" : "s"}`
      : `${Math.max(hours, 1)} hour${Math.max(hours, 1) === 1 ? "" : "s"}`;
  return past ? `${value} ago` : `in ${value}`;
}

function headline(state: AgentState, autoPublish: boolean): string {
  switch (state) {
    case "paused_no_subscription":
      return "Subscribe to put your writer on the job — researching and writing for your brand every day.";
    case "paused_no_credits":
      return "Out of credits — paused with topics ready to write. Top up to put her back to work.";
    case "idle_caught_up":
      return autoPublish
        ? "All caught up — every researched topic is written. Fresh topics surface on her next run."
        : "All caught up — drafts are waiting for your review. Fresh topics surface on her next run.";
    default:
      return autoPublish
        ? "Researches your niche, writes, and auto-publishes to your channels every day — hands-free."
        : "Researches your niche and writes fresh articles every day. You approve, she publishes.";
  }
}

/** State label as plain coloured text with a status dot — never a chip (per the
 * house no-pills rule). */
function stateLabel(state: AgentState): { label: string; className: string } {
  switch (state) {
    case "paused_no_subscription":
      return { label: "Paused", className: "text-muted" };
    case "paused_no_credits":
      return { label: "Out of credits", className: "text-danger" };
    case "idle_caught_up":
      return { label: "Caught up", className: "text-accent" };
    default:
      return { label: "On the job", className: "text-success" };
  }
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="material-panel">
      <p className="text-sm font-medium tracking-[0.01em] text-muted">{label}</p>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p> : null}
    </Card>
  );
}

export function ContentAgentSnapshot({
  automation,
  credits,
  monthlyCreditGrant,
}: {
  automation: AutomationStats;
  credits: CreditBalance;
  monthlyCreditGrant: number;
}) {
  const {
    autoPublish,
    schedule,
    nextRunAt,
    agentState,
    dailyCap,
    pendingTopics,
    nextTopic,
    articlesWritten,
    articlesPublished,
    thisWeek,
  } = automation;
  const state = stateLabel(agentState);

  const showMeter = monthlyCreditGrant > 0;
  const meterPct = showMeter ? (credits.monthly / monthlyCreditGrant) * 100 : 0;
  const meterColor =
    credits.total <= 0 ? "danger" : showMeter && meterPct <= 20 ? "warning" : "success";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-title text-lg text-foreground">Content agent</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">
            {headline(agentState, autoPublish)}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-medium tracking-[0.01em]",
            state.className,
          )}
        >
          <span className="size-2 rounded-full bg-current" aria-hidden />
          {state.label}
        </span>
      </div>

      {nextTopic && agentState === "active" ? (
        <p className="text-sm leading-relaxed text-muted">
          Writing next:{" "}
          <span className="font-medium tracking-tight text-foreground">{nextTopic.title}</span>
          {nextTopic.thesis ? <> — {nextTopic.thesis}</> : null}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Articles written"
          value={articlesWritten}
          hint={`${thisWeek.articlesWritten} this week`}
        />
        <Tile
          label="Published"
          value={articlesPublished}
          hint={
            articlesPublished > 0
              ? `${thisWeek.articlesPublished} this week`
              : "live on your channels"
          }
        />
        <Tile
          label="Topics queued"
          value={pendingTopics}
          hint={`writes up to ${dailyCap}/day`}
        />
        <Tile
          label="Next run"
          value={nextRunAt ? relativeLabel(nextRunAt) : "—"}
          hint={nextRunAt ? schedule : "resumes when subscribed"}
        />
      </div>

      {showMeter ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Credits — her fuel this month</span>
            <span className="text-foreground tabular-nums">
              {credits.monthly.toLocaleString()} / {monthlyCreditGrant.toLocaleString()}
            </span>
          </div>
          <Meter
            aria-label="Monthly credits remaining"
            color={meterColor}
            size="sm"
            value={credits.monthly}
            maxValue={monthlyCreditGrant}
          >
            <Meter.Track>
              <Meter.Fill />
            </Meter.Track>
          </Meter>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href="/articles" className={buttonVariants({ size: "sm", variant: "secondary" })}>
          View articles
        </Link>
        <Link href="/topics" className={buttonVariants({ size: "sm", variant: "secondary" })}>
          Topic queue
        </Link>
      </div>
    </section>
  );
}
