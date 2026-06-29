import { Card } from "@heroui/react/card";
import { Chip } from "@heroui/react/chip";
import Link from "next/link";
import type { AgentState, AutomationStats } from "@/lib/api/queries";
import { statusColor } from "@/lib/ui/status";

type AutomationCardProps = {
  automation: AutomationStats;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "3 days ago" / "in 2 days" style label relative to now. */
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

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

type ChipColor = "success" | "default" | "danger" | "accent";

function stateChip(state: AgentState): { color: ChipColor; label: string } {
  switch (state) {
    case "paused_no_subscription":
      return { color: "default", label: "Paused" };
    case "paused_no_credits":
      return { color: "danger", label: "Out of credits" };
    case "idle_caught_up":
      return { color: "accent", label: "Caught up" };
    default:
      return { color: "success", label: "On the job" };
  }
}

function headline(state: AgentState, autoPublish: boolean): string {
  switch (state) {
    case "paused_no_subscription":
      return "Put a writer on the job — researching and writing for your brand every day. Subscribe to start.";
    case "paused_no_credits":
      return "Your agent is out of credits — paused with topics ready to write. Top up add-on credits to put it back to work.";
    case "idle_caught_up":
      return autoPublish
        ? "All caught up — every researched topic is written. Your agent will surface fresh topics on its next run."
        : "All caught up — drafts are waiting for your review. Your agent will surface fresh topics on its next run.";
    default:
      return autoPublish
        ? "Researches your niche, writes, and auto-publishes to your channels every day — hands-free."
        : "Researches your niche and writes fresh articles for your brand every day. You approve, it publishes.";
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
    <Card>
      <p className="text-sm font-medium text-muted">{label}</p>
      <div className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

export function AutomationCard({ automation }: AutomationCardProps) {
  const {
    enabled,
    autoPublish,
    schedule,
    nextRunAt,
    agentState,
    dailyCap,
    writtenToday,
    pendingTopics,
    workingSince,
    totalRuns,
    articlesWritten,
    articlesPublished,
    thisWeek,
    lastRun,
  } = automation;

  const chip = stateChip(agentState);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Your content agent</h2>
          <p className="mt-1 text-sm text-muted">{headline(agentState, autoPublish)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Chip color={chip.color} variant="soft" size="sm">
            {chip.label}
          </Chip>
          <Chip color={autoPublish ? "success" : "default"} variant="soft" size="sm">
            {autoPublish ? "Auto-publish" : "Review mode"}
          </Chip>
        </div>
      </div>

      {enabled ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>
            Writes up to <span className="font-medium text-foreground">{dailyCap}/day</span>
          </span>
          <span aria-hidden>·</span>
          <span>
            <span className="font-medium text-foreground">{writtenToday}</span> today
          </span>
          <span aria-hidden>·</span>
          <span>
            <span className="font-medium text-foreground">{pendingTopics}</span>{" "}
            {pendingTopics === 1 ? "topic" : "topics"} queued
          </span>
          {agentState === "paused_no_credits" ? (
            <>
              <span aria-hidden>·</span>
              <Link
                href="/pricing"
                className="font-medium text-danger underline-offset-2 hover:underline"
              >
                Buy add-on credits
              </Link>
            </>
          ) : null}
        </div>
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
            articlesPublished > 0 ? `${thisWeek.articlesPublished} this week` : "live on your channels"
          }
        />
        <Tile
          label="Last run"
          value={
            lastRun ? (
              <span className="inline-flex items-center gap-2">
                <span>{relativeLabel(lastRun.createdAt)}</span>
                <Chip color={statusColor(lastRun.status)} variant="soft" size="sm">
                  {lastRun.status}
                </Chip>
              </span>
            ) : (
              "—"
            )
          }
          hint={
            lastRun
              ? `${lastRun.articlesGenerated} written · ${lastRun.topicsResearched} topics researched`
              : "No runs yet"
          }
        />
        <Tile
          label="Next run"
          value={nextRunAt ? relativeLabel(nextRunAt) : "—"}
          hint={nextRunAt ? schedule : "Resumes when subscribed"}
        />
      </div>

      <p className="text-xs text-muted">
        On the job since {monthYear(workingSince)}
        {totalRuns > 0 ? ` · ${totalRuns} run${totalRuns === 1 ? "" : "s"} so far` : ""}.
        {!autoPublish && enabled ? (
          <>
            {" "}
            Articles wait as drafts for your review —{" "}
            <Link href="/settings" className="text-foreground underline-offset-2 hover:underline">
              turn on auto-publish
            </Link>{" "}
            to let it ship on its own.
          </>
        ) : null}
      </p>
    </section>
  );
}
