"use client";

import { ActivityPanel } from "@/components/activity/activity-panel";
import { PageHeader } from "@/components/layout/page-header";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useActivity } from "@/lib/api/queries";

function jobLabel(kind: string) {
  switch (kind) {
    case "weekly_pipeline":
      return "Weekly pipeline";
    case "writing":
      return "Writing job";
    case "research":
      return "Research job";
    default:
      return kind;
  }
}

export default function ActivityPage() {
  const { data, isLoading, error, refetch } = useActivity();

  const items = data
    ? [
        ...data.runs.map((run) => ({
          id: run.id,
          type: "research_run" as const,
          title: "Research run",
          status: run.status,
          message: run.summary ?? "No summary",
          createdAt: run.createdAt,
          detail: `${run.topicsCreated ?? 0} topics added`,
          canRetry: run.status === "failed",
        })),
        ...data.jobs.map((job) => ({
          id: job.id,
          type: "agent_job" as const,
          title: jobLabel(job.kind),
          status: job.status,
          message: job.message ?? "No message",
          createdAt: job.createdAt,
          detail: job.kind,
          canRetry: job.status === "failed",
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activity"
        description="Research runs, writing jobs, and retryable failures."
      />

      {isLoading ? (
        <PageLoader label="Loading activity…" />
      ) : error || !data ? (
        <PageError error={error} onRetry={() => refetch()} />
      ) : (
        <ActivityPanel items={items} />
      )}
    </div>
  );
}
