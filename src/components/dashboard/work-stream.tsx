"use client";

import { buttonVariants } from "@heroui/react/button";
import { Button, Card } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react/empty-state";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ActivityIcon,
  ChevronRightIcon,
  GaugeIcon,
  PenIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";
import { StatusText } from "@/components/ui/status-text";
import {
  activityEventIconKind,
  filterActivityItems,
  isItemLive,
  type ActivityFeedItem,
  type StreamFilter,
} from "@/lib/activity/items";
import { useAgentIsLive } from "@/lib/api/queries";
import type { AgentEventView } from "@/lib/agent/types";
import { cn } from "@/lib/cn";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_ACTIVITY_ITEMS: ActivityFeedItem[] = [];

const FILTERS: { id: StreamFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "content", label: "Content" },
  { id: "visibility", label: "Visibility" },
  { id: "setup", label: "Setup" },
  { id: "failed", label: "Failed" },
];

const ICONS = {
  users: UsersIcon,
  gauge: GaugeIcon,
  search: SearchIcon,
  pen: PenIcon,
  activity: ActivityIcon,
} as const;

function relativeLabel(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const days = Math.round(abs / DAY_MS);
  const hours = Math.round(abs / (60 * 60 * 1000));
  const mins = Math.round(abs / (60 * 1000));
  const value =
    days >= 1
      ? `${days} day${days === 1 ? "" : "s"}`
      : hours >= 1
        ? `${hours} hour${hours === 1 ? "" : "s"}`
        : `${Math.max(mins, 1)} min`;
  return past ? `${value} ago` : `in ${value}`;
}

function eventIcon(item: ActivityFeedItem) {
  return ICONS[activityEventIconKind(item)];
}

type WorkStreamProps = {
  items?: ActivityFeedItem[];
  events?: AgentEventView[];
  /** Cap rows on the home surface; omit for full list. */
  limit?: number;
  /** Show category / status chips (work log page). */
  filterable?: boolean;
  className?: string;
};

/**
 * Agent OS live work stream: Claudia's first-person timeline.
 * Polls while jobs are in flight (via useActivity); optional filters on /activity.
 */
export function WorkStream({
  items = EMPTY_ACTIVITY_ITEMS,
  events,
  limit,
  filterable = false,
  className,
}: WorkStreamProps) {
  const live = useAgentIsLive();
  const [filter, setFilter] = useState<StreamFilter>("all");

  const filtered = useMemo(
    () => (filterable ? filterActivityItems(items, filter) : items),
    [filterable, filter, items],
  );
  const visible = typeof limit === "number" ? filtered.slice(0, limit) : filtered;
  const hasMore = typeof limit === "number" && filtered.length > limit;
  const activeCount = items.filter(isItemLive).length;

  if (events) {
    return (
      <AgentEventTimeline
        events={typeof limit === "number" ? events.slice(0, limit) : events}
        hasMore={typeof limit === "number" && events.length > limit}
        live={live}
        className={className}
      />
    );
  }

  if (items.length === 0) {
    return (
      <section className={cn("space-y-3", className)}>
        <StreamHeader live={live} activeCount={0} />
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <ActivityIcon />
            </EmptyState.Media>
            <EmptyState.Title>Nothing yet</EmptyState.Title>
            <EmptyState.Description>
              Once I start researching, writing, and checking visibility, every move shows up
              here in plain language.
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      </section>
    );
  }

  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <StreamHeader live={live} activeCount={activeCount} />
        {hasMore ? (
          <Link
            href="/activity"
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors hover-fine:text-foreground"
          >
            Full log
            <ChevronRightIcon className="size-3.5" />
          </Link>
        ) : null}
      </div>

      {filterable ? (
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((chip) => {
            const count =
              chip.id === "all"
                ? items.length
                : filterActivityItems(items, chip.id).length;
            if (chip.id !== "all" && count === 0) return null;
            const selected = filter === chip.id;
            return (
              <Button
                key={chip.id}
                size="sm"
                variant={selected ? "secondary" : "ghost"}
                aria-pressed={selected}
                onPress={() => setFilter(chip.id)}
              >
                {chip.label}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </Button>
            );
          })}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm leading-relaxed text-muted">Nothing in this filter right now.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-separator p-0">
          {visible.map((item) => {
            const Icon = eventIcon(item);
            const itemLive = isItemLive(item);
            const body = (
              <div className="surface-interactive flex items-start gap-3 rounded-none p-4">
                <span
                  className={cn(
                    "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                    itemLive
                      ? "bg-accent-soft text-accent-soft-foreground"
                      : item.status === "failed"
                        ? "bg-danger-soft text-danger-soft-foreground"
                        : "bg-surface-secondary text-muted",
                  )}
                >
                  <Icon className={cn("size-4", itemLive && "animate-pulse")} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug tracking-tight text-foreground">
                    {item.narrative}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <StatusText status={item.status} />
                    <span aria-hidden>·</span>
                    <time dateTime={item.createdAt}>{relativeLabel(item.createdAt)}</time>
                    {item.credits > 0 ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">
                          −{item.credits.toLocaleString()} credits
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                {item.href ? (
                  <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted" />
                ) : null}
              </div>
            );

            if (item.href) {
              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={item.href}
                  className="block"
                >
                  {body}
                </Link>
              );
            }

            return <div key={`${item.type}-${item.id}`}>{body}</div>;
          })}
        </Card>
      )}

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <Link href="/activity" className={buttonVariants({ size: "sm", variant: "ghost" })}>
            View full work log
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function AgentEventTimeline({
  events,
  hasMore,
  live,
  className,
}: {
  events: AgentEventView[];
  hasMore: boolean;
  live: boolean;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted">Work record</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-foreground">Recent work</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Artifacts, changes, and outcomes from Claudia&apos;s event record.
          </p>
        </div>
        {hasMore ? (
          <Link href="/activity" className="shrink-0 text-sm text-muted hover-fine:text-foreground">
            Full log
          </Link>
        ) : null}
      </div>

      {events.length ? (
        <ol className="relative space-y-0 before:absolute before:bottom-5 before:left-[0.6875rem] before:top-5 before:w-px before:bg-separator">
          {events.map((event) => {
            const Icon =
              event.type === "artifact_created"
                ? PenIcon
                : event.type === "applied" || event.type === "verified"
                  ? GaugeIcon
                  : event.type === "planned" || event.type === "replanned"
                    ? SearchIcon
                    : ActivityIcon;
            const content = (
              <div className="relative flex min-h-16 items-start gap-4 py-3">
                <span
                  className={cn(
                    "relative z-10 flex size-[1.375rem] shrink-0 items-center justify-center rounded-full bg-surface ring-4 ring-background",
                    event.type === "failed" || event.type === "regressed"
                      ? "text-danger"
                      : event.type === "verified"
                        ? "text-success"
                        : "text-accent",
                  )}
                >
                  <Icon className={cn("size-3", live && event.type === "started" && "animate-pulse")} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-6 text-foreground">{event.summary}</p>
                  <time
                    dateTime={event.createdAt}
                    className="mt-0.5 block text-xs text-muted"
                    suppressHydrationWarning
                  >
                    {relativeLabel(event.createdAt)}
                  </time>
                </div>
                {event.artifactRef ? <ChevronRightIcon className="mt-1 size-4 text-muted" /> : null}
              </div>
            );
            return (
              <li key={event.id}>
                {event.artifactRef?.startsWith("/") ? (
                  <Link href={event.artifactRef} className="block rounded-xl hover-fine:bg-surface-secondary/60">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm leading-6 text-muted">No durable work events yet.</p>
      )}
    </section>
  );
}

function StreamHeader({ live, activeCount }: { live: boolean; activeCount: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-title text-lg text-foreground">What I&apos;ve been doing</h2>
        {live ? (
          <span className="text-xs font-medium tracking-[0.01em] text-success">
            Live
            {activeCount > 0 ? ` · ${activeCount}` : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {live
          ? "Updating as I work. Newest items appear first."
          : "Newest items appear first. Open a row to see the related work."}
      </p>
    </div>
  );
}
