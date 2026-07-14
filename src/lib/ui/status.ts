export type StatusTone = "default" | "accent" | "success" | "warning" | "danger";

/**
 * Maps a domain status string to a semantic text tone. Neutral states stay
 * muted, while success / warning / danger are reserved for real meaning:
 * a finished run, a failure, an action that needs attention.
 */
export function statusColor(status: string): StatusTone {
  switch (status) {
    case "completed":
    case "published":
    case "approved":
    case "active":
      return "success";
    case "failed":
    case "error":
      return "danger";
    case "running":
    case "pending":
    case "queued":
    case "in_progress":
      return "warning";
    default:
      return "default";
  }
}

const STATUS_TEXT: Record<StatusTone, string> = {
  default: "text-muted",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent",
};

/**
 * Design rule: no Chip/pill badges: statuses render as plain colored text.
 * Maps a domain status to its text color class (grey for neutral states).
 */
export function statusTextClass(status: string): string {
  return toneTextClass(statusColor(status));
}

export function toneTextClass(tone: StatusTone): string {
  return STATUS_TEXT[tone];
}
