"use client";

import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
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
import { cn } from "@/lib/cn";

const DAY_MS = 24 * 60 * 60 * 1000;

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
  items: ActivityFeedItem[];
  /** Cap rows on the home surface; omit for full list. */
  limit?: number;
  /** Show category / status chips (work log page). */
  filterable?: boolean;
  className?: string;
};

/**
 * Agent OS live work stream — Claudia's first-person timeline.
 * Polls while jobs are in flight (via useActivity); optional filters on /activity.
 */
export function WorkStream({ items, limit, filterable = false, className }: WorkStreamProps) {
  const live = useAgentIsLive();
  const [filter, setFilter] = useState<StreamFilter>("all");

  const filtered = useMemo(
    () => (filterable ? filterActivityItems(items, filter) : items),
    [filterable, filter, items],
  );
  const visible = typeof limit === "number" ? filtered.slice(0, limit) : filtered;
  const hasMore = typeof limit === "number" && filtered.length > limit;
  const activeCount = items.filter(isItemLive).length;

  if (items.length === 0) {
    return (
      <section className={cn("space-y-3", className)}>
        <StreamHeader live={live} activeCount={0} />
        <EmptyState className="rounded-xl border border-dashed border-border">
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
            className="inline-flex shrink-0 items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
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
              <button
                key={chip.id}
                type="button"
                onClick={() => setFilter(chip.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  selected
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-secondary text-muted hover:text-foreground",
                )}
              >
                {chip.label}
                <span className="ml-1 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted">Nothing in this filter right now.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {visible.map((item) => {
            const Icon = eventIcon(item);
            const itemLive = isItemLive(item);
            const body = (
              <div className="flex items-start gap-3 p-4">
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
                  <p className="text-sm font-medium leading-snug text-foreground">
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
                  className="block transition-colors hover:bg-overlay/40"
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

function StreamHeader({ live, activeCount }: { live: boolean; activeCount: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-foreground">What I&apos;ve been doing</h2>
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success-soft-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden />
            Live
            {activeCount > 0 ? ` · ${activeCount}` : ""}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        {live
          ? "Updating as I work — newest first."
          : "Newest first — tap a row for the related artifact."}
      </p>
    </div>
  );
}
