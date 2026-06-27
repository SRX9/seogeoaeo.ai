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
          credits: run.creditsSpent,
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
          credits: job.creditsSpent,
          canRetry: job.status === "failed",
        })),
        ...data.competitors.map((run) => ({
          id: run.id,
          type: "competitor_run" as const,
          title: "Competitor discovery",
          status: run.status,
          message: "Discovered competitor suggestions",
          createdAt: run.createdAt,
          detail: "competitor",
          credits: run.creditsSpent,
          canRetry: false,
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
