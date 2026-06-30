"use client";

import { Chip, toast } from "@heroui/react";
import { Table } from "@heroui/react/table";
import { EmptyState } from "@heroui-pro/react/empty-state";
import { LoadingButton } from "@/components/ui/loading-button";
import { ActivityIcon, PenIcon, SearchIcon, UsersIcon } from "@/components/icons";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, type ActivityResponse } from "@/lib/api/queries";
import { statusColor } from "@/lib/ui/status";

type ActivityCache = ActivityResponse;

type ActivityItem = {
  id: string;
  type: "research_run" | "agent_job" | "competitor_run";
  title: string;
  status: string;
  message: string;
  createdAt: string;
  detail: string;
  credits: number;
  canRetry: boolean;
};

type ActivityPanelProps = {
  items: ActivityItem[];
};

// Research runs and research jobs surface a search glyph; writing jobs use the
// pen; competitor discoveries use the people glyph. Everything else (e.g. the
// weekly pipeline) falls back to the activity pulse so each row reads at a glance.
function eventIcon(item: ActivityItem) {
  if (item.type === "competitor_run") {
    return UsersIcon;
  }
  if (item.type === "research_run" || item.detail === "research") {
    return SearchIcon;
  }
  if (item.detail === "writing") {
    return PenIcon;
  }
  return ActivityIcon;
}

export function ActivityPanel({ items }: ActivityPanelProps) {
  const retry = useOptimisticMutation<unknown, ActivityItem, ActivityCache>({
    mutationFn: (item) => apiPost("/api/activity/retry", { type: item.type, id: item.id }),
    queryKey: queryKeys.activity,
    // Flip the failed entry to "pending" so its chip updates and the Retry
    // button hides immediately (the page derives canRetry from status).
    optimisticUpdate: (current, item) => {
      if (!current) return current;
      if (item.type === "agent_job") {
        return {
          ...current,
          jobs: current.jobs.map((job) =>
            job.id === item.id ? { ...job, status: "pending" } : job,
          ),
        };
      }
      return {
        ...current,
        runs: current.runs.map((run) =>
          run.id === item.id ? { ...run, status: "pending" } : run,
        ),
      };
    },
    invalidateKeys: [
      queryKeys.automation,
      queryKeys.onboarding,
      queryKeys.topics,
      queryKeys.articles,
    ],
    onSuccess: () => toast.success("Retry started."),
    onError: (error) => toast.danger(getErrorMessage(error, "Retry failed. Try again.")),
  });

  if (items.length === 0) {
    return (
      <EmptyState className="rounded-xl border border-dashed border-border">
        <EmptyState.Header>
          <EmptyState.Title>No activity yet</EmptyState.Title>
          <EmptyState.Description>
            Run research from the dashboard or wait for the weekly cron.
          </EmptyState.Description>
        </EmptyState.Header>
      </EmptyState>
    );
  }

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Activity log" className="min-w-[720px]">
          <Table.Header>
            <Table.Column id="event" isRowHeader>
              Event
            </Table.Column>
            <Table.Column id="status">Status</Table.Column>
            <Table.Column id="credits">Credits</Table.Column>
            <Table.Column id="time">Time</Table.Column>
            <Table.Column id="action">
              <span className="sr-only">Actions</span>
            </Table.Column>
          </Table.Header>
          <Table.Body>
            {items.map((item) => {
              const isRetrying = retry.isPending && retry.variables?.id === item.id;
              const Icon = eventIcon(item);
              return (
                <Table.Row key={`${item.type}-${item.id}`} id={`${item.type}-${item.id}`}>
                  <Table.Cell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-muted">
                        <Icon className="size-4" />
                      </span>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{item.title}</span>
                        <span className="max-w-md truncate text-xs text-muted">
                          {item.message}
                        </span>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Chip color={statusColor(item.status)} variant="soft" size="sm">
                      {item.status}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell>
                    {item.credits > 0 ? (
                      <span className="font-medium text-foreground tabular-nums">
                        -{item.credits.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-xs text-muted tabular-nums">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="text-end">
                    {item.canRetry ? (
                      <LoadingButton
                        size="sm"
                        variant="secondary"
                        isPending={isRetrying}
                        pendingLabel="Retrying…"
                        isDisabled={retry.isPending}
                        onPress={() => retry.mutate(item)}
                      >
                        Retry
                      </LoadingButton>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
