"use client";

import { Button, Card, ListBox, Select, Skeleton } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ActivityIcon,
  ChevronRightIcon,
  GaugeIcon,
  LinkIcon,
  PenIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import {
  activityEventIconKind,
  filterActivityItems,
  isItemLive,
  toActivityFeedItems,
  type ActivityFeedItem,
  type StreamFilter,
} from "@/lib/activity/items";
import { useActivity, useAgentIsLive } from "@/lib/api/queries";

const FILTERS: { id: StreamFilter; label: string }[] = [
  { id: "all", label: "All Activity" },
  { id: "active", label: "In Progress" },
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

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function utcDayOffset(offset: number) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function dayLabel(iso: string) {
  const key = dayKey(iso);
  if (key === utcDayOffset(0)) return "Today";
  if (key === utcDayOffset(-1)) return "Yesterday";
  return dateFormatter.format(new Date(iso));
}

function artifactLabel(item: ActivityFeedItem) {
  if (item.detail === "writing" || item.detail === "performance_check") return "Articles";
  if (item.type === "research_run" || item.detail === "research") return "Topic Queue";
  if (item.detail === "site_health_check") return "Site Health";
  if (item.detail === "visibility_monitor") return "Visibility Report";
  if (item.type === "competitor_run" || item.detail === "competitor_rediscovery") return "Brand Intelligence";
  if (item.detail === "setup_run") return "Claudia Setup";
  return item.title;
}

function eventTag(item: ActivityFeedItem): {
  label: string;
  color: "danger" | "success" | "accent" | "default";
} {
  if (item.status === "failed") return { label: "Attention", color: "danger" };
  if (isItemLive(item)) return { label: "Working", color: "success" };
  if (item.category === "visibility") return { label: "Visibility", color: "accent" };
  if (item.category === "content") return { label: "Content", color: "default" };
  if (item.category === "setup") return { label: "Setup", color: "default" };
  return { label: "Done", color: "success" };
}

function groupItems(items: ActivityFeedItem[]) {
  const groups: Array<{ label: string; items: ActivityFeedItem[] }> = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

function TimelineItem({ item }: { item: ActivityFeedItem }) {
  const Icon = ICONS[activityEventIconKind(item)];
  const tag = eventTag(item);
  const row = (
    <div className="flex min-w-0 items-start gap-3 px-4 py-4 sm:items-center sm:px-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 text-sm font-medium leading-6 text-foreground">{item.narrative}</p>
          <ToneText tone={tag.color} className="text-xs">{tag.label}</ToneText>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <time className="tabular-nums" dateTime={item.createdAt}>{timeFormatter.format(new Date(item.createdAt))}</time>
          <span aria-hidden>·</span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <LinkIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{artifactLabel(item)}</span>
          </span>
        </div>
      </div>
      {item.href ? <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted sm:mt-0" aria-hidden /> : null}
    </div>
  );

  return item.href ? (
    <Link
      href={item.href}
      className="block rounded-2xl no-underline outline-none hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus"
      aria-label={`${item.narrative}: ${artifactLabel(item)}`}
    >
      {row}
    </Link>
  ) : row;
}

function WorkLogTimeline({ items }: { items: ActivityFeedItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Media variant="icon"><ActivityIcon /></EmptyState.Media>
            <EmptyState.Title>No Activity Here</EmptyState.Title>
            <EmptyState.Description>New work will appear here as Claudia completes it.</EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {groupItems(items).map((group) => (
        <section key={group.label} aria-labelledby={`work-log-${group.label}`}>
          <h2 id={`work-log-${group.label}`} className="mb-3 text-sm font-medium text-muted">{group.label}</h2>
          <Card className="divide-y divide-separator p-0">
            {group.items.map((item) => <TimelineItem key={`${item.type}-${item.id}`} item={item} />)}
          </Card>
        </section>
      ))}
    </div>
  );
}

function LoadingTimeline() {
  return (
    <div className="space-y-3" aria-label="Loading work log">
      {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full rounded-2xl" />)}
    </div>
  );
}

export default function ActivityPage() {
  const activity = useActivity();
  const live = useAgentIsLive();
  const [filter, setFilter] = useState<StreamFilter>("all");
  const items = useMemo(() => (activity.data ? toActivityFeedItems(activity.data) : []), [activity.data]);
  const visibleItems = useMemo(() => filterActivityItems(items, filter), [filter, items]);
  const activeItem = items.find(isItemLive);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <ToneText tone={live ? "success" : "accent"}>{live ? "Working Now" : "On Duty"}</ToneText>
          <h1 className="sr-only">Activity</h1>
          <p className="mt-1 text-sm leading-6 text-muted">A clear record of research, content, setup, and visibility work.</p>
        </div>
        <Select
          aria-label="Filter work log"
          className="w-full sm:w-56"
          value={filter}
          onChange={(key) => setFilter(key as StreamFilter)}
        >
          <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
          <Select.Popover>
            <ListBox>
              {FILTERS.map((option) => (
                <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                  {option.label}<ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </header>

      <Card variant="secondary">
        <Card.Header className="flex-row items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-accent" aria-hidden>
            <ActivityIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <Card.Title>Current Activity</Card.Title>
            <Card.Description className="mt-1 line-clamp-2">
              {activeItem?.narrative ?? "Monitoring your priorities and ready for the next run."}
            </Card.Description>
          </div>
        </Card.Header>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Activity</h2>
        <span className="text-sm text-muted tabular-nums">
          {visibleItems.length} {visibleItems.length === 1 ? "Item" : "Items"}
        </span>
      </div>

      {activity.isLoading ? <LoadingTimeline /> : null}
      {activity.error ? (
        <Card role="alert">
          <Card.Header>
            <Card.Title>Couldn&apos;t Load the Work Log</Card.Title>
            <Card.Description>Try the request again.</Card.Description>
          </Card.Header>
          <Card.Footer><Button variant="outline" onPress={() => activity.refetch()}>Try Again</Button></Card.Footer>
        </Card>
      ) : null}
      {!activity.isLoading && !activity.error ? <WorkLogTimeline items={visibleItems} /> : null}
    </main>
  );
}
