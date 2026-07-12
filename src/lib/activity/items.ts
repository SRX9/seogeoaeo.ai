import type { ActivityResponse } from "@/lib/api/queries";

export type ActivityFeedItem = {
  id: string;
  type: "research_run" | "agent_job" | "competitor_run";
  title: string;
  status: string;
  message: string;
  /** First-person Claudia narrative for the Agent OS work stream. */
  narrative: string;
  createdAt: string;
  detail: string;
  credits: number;
  canRetry: boolean;
  href: string | null;
  /** Coarse filter bucket for the work log UI. */
  category: StreamCategory;
};

export type StreamCategory = "content" | "visibility" | "setup" | "other";

export type StreamFilter = "all" | StreamCategory | "failed" | "active";

export function streamCategory(item: {
  type: ActivityFeedItem["type"];
  detail: string;
}): StreamCategory {
  if (
    item.type === "research_run" ||
    item.detail === "research" ||
    item.detail === "writing" ||
    item.detail === "performance_check" ||
    item.detail === "daily_pipeline" ||
    item.detail === "weekly_pipeline"
  ) {
    return "content";
  }
  if (
    item.detail === "visibility_monitor" ||
    item.detail === "site_health_check" ||
    item.type === "competitor_run" ||
    item.detail === "competitor" ||
    item.detail === "competitor_rediscovery"
  ) {
    return "visibility";
  }
  if (item.detail === "setup_run") return "setup";
  return "other";
}

/** Shared icon key for work stream + activity panel (map to icons in UI). */
export type ActivityIconKind = "users" | "gauge" | "search" | "pen" | "activity";

export function activityEventIconKind(item: {
  type: ActivityFeedItem["type"];
  detail: string;
  category?: StreamCategory;
}): ActivityIconKind {
  if (item.type === "competitor_run" || item.detail === "competitor_rediscovery" || item.detail === "competitor") {
    return "users";
  }
  if (item.category === "visibility" || item.detail === "visibility_monitor" || item.detail === "site_health_check") {
    return "gauge";
  }
  if (item.type === "research_run" || item.detail === "research") return "search";
  if (item.detail === "writing" || item.category === "content") return "pen";
  return "activity";
}

export function filterActivityItems(
  items: ActivityFeedItem[],
  filter: StreamFilter,
): ActivityFeedItem[] {
  if (filter === "all") return items;
  if (filter === "failed") return items.filter((i) => i.status === "failed");
  if (filter === "active") {
    return items.filter((i) => i.status === "running" || i.status === "pending");
  }
  return items.filter((i) => i.category === filter);
}

export function isItemLive(item: ActivityFeedItem): boolean {
  return item.status === "running" || item.status === "pending";
}

function jobLabel(kind: string) {
  switch (kind) {
    case "weekly_pipeline":
    case "daily_pipeline":
      return "Daily work";
    case "writing":
      return "Writing";
    case "research":
      return "Research";
    case "setup_run":
      return "Setup";
    case "competitor_rediscovery":
      return "Competitor scan";
    case "site_health_check":
      return "Site health check";
    case "visibility_monitor":
      return "Visibility check";
    case "performance_check":
      return "Article performance";
    default:
      return kind.replace(/_/g, " ");
  }
}

/** Owner-facing first-person line for the live work stream. */
function jobNarrative(kind: string, status: string, message: string | null): string {
  const note = message?.trim();
  const failed = status === "failed";
  const running = status === "running" || status === "pending";

  switch (kind) {
    case "writing":
      if (failed) return note ? `I hit a snag writing: ${note}` : "I hit a snag on a writing job.";
      if (running) return note ?? "I'm writing an article for you right now.";
      return note ?? "I finished a writing pass.";
    case "research":
      if (failed) return note ? `Research stalled. ${note}` : "Research stalled. I can retry it.";
      if (running) return "I'm mining topics worth writing next.";
      return note ?? "I finished a research pass and updated your topic queue.";
    case "setup_run":
      if (failed) return note ? `Setup stopped. ${note}` : "Setup stopped. I can retry it.";
      if (running) return "I'm setting myself up on your brand.";
      return note ?? "I'm fully set up and working.";
    case "visibility_monitor":
      if (failed) return note ? `Visibility check failed: ${note}` : "A visibility check failed.";
      if (running) return "I'm re-checking your search and AI visibility.";
      return note ?? "I re-checked your visibility and queued what needs fixing.";
    case "site_health_check":
      if (running) return "I'm rechecking site health.";
      return note ?? "I finished a site health pass.";
    case "competitor_rediscovery":
      if (running) return "I'm scanning competitors again.";
      return note ?? "I refreshed competitor intel.";
    case "performance_check":
      if (running) return "I'm checking how published pieces are performing.";
      return note ?? "I reviewed article performance and updated my plan.";
    case "daily_pipeline":
    case "weekly_pipeline":
      if (running) return "I'm on my daily pass: research, writing, and follow-ups.";
      return note ?? "I finished my daily pass.";
    default:
      if (failed) return note ? `Something failed. ${note}` : "Something failed. I can retry it.";
      if (running) return note ?? "I'm working on this now.";
      return note ?? `I completed: ${jobLabel(kind)}.`;
  }
}

function researchNarrative(status: string, summary: string | null, topicsCreated: number | null) {
  if (status === "failed") return summary?.trim() || "Research failed. I can retry it.";
  if (status === "running" || status === "pending") return "I'm researching topics for your brand.";
  const topics = topicsCreated ?? 0;
  if (summary?.trim()) return summary.trim();
  if (topics > 0) {
    return `I found ${topics} topic${topics === 1 ? "" : "s"} worth writing.`;
  }
  return "I finished a research run.";
}

function artifactHref(item: {
  type: ActivityFeedItem["type"];
  detail: string;
}): string | null {
  if (item.type === "research_run" || item.detail === "research") return "/topics";
  if (item.detail === "writing") return "/articles";
  if (item.detail === "visibility_monitor") return "/visibility";
  if (item.detail === "site_health_check") return "/visibility/health";
  if (item.detail === "performance_check") return "/articles";
  if (item.detail === "setup_run" || item.detail === "daily_pipeline" || item.detail === "weekly_pipeline") {
    return "/dashboard";
  }
  if (item.type === "competitor_run" || item.detail === "competitor_rediscovery") {
    return "/settings?tab=brand";
  }
  return null;
}

function withMeta(base: Omit<ActivityFeedItem, "href" | "category">): ActivityFeedItem {
  return {
    ...base,
    category: streamCategory(base),
    href: artifactHref(base),
  };
}

/** Normalize activity API payload into a single chronological feed. */
export function toActivityFeedItems(data: ActivityResponse): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [
    ...data.runs.map((run) =>
      withMeta({
        id: run.id,
        type: "research_run",
        title: "Research run",
        status: run.status,
        message: run.summary ?? "No summary",
        narrative: researchNarrative(run.status, run.summary, run.topicsCreated),
        createdAt: run.createdAt,
        // Keep kind-like detail for filtering; topics count lives in narrative.
        detail: "research",
        credits: run.creditsSpent,
        canRetry: run.status === "failed",
      }),
    ),
    ...data.jobs.map((job) =>
      withMeta({
        id: job.id,
        type: "agent_job",
        title: jobLabel(job.kind),
        status: job.status,
        message: job.message ?? "No message",
        narrative: jobNarrative(job.kind, job.status, job.message),
        createdAt: job.createdAt,
        detail: job.kind,
        credits: job.creditsSpent,
        canRetry: job.status === "failed",
      }),
    ),
    ...data.competitors.map((run) => {
      const failed = run.status === "failed";
      const running = run.status === "running" || run.status === "pending";
      return withMeta({
        id: run.id,
        type: "competitor_run",
        title: "Competitor discovery",
        status: run.status,
        message: failed
          ? "Competitor scan failed"
          : running
            ? "Scanning competitors"
            : "Discovered competitor suggestions",
        narrative: failed
          ? "The competitor scan failed. I can try again from Brand settings."
          : running
            ? "I'm scanning competitors again."
            : "I found competitor suggestions you may want to track.",
        createdAt: run.createdAt,
        detail: "competitor",
        credits: run.creditsSpent,
        canRetry: failed,
      });
    }),
  ];

  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}
