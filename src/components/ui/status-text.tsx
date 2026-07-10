import { cn } from "@/lib/cn";
import { statusColor } from "@/lib/ui/status";

const TEXT: Record<string, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent",
};

const DOT: Record<string, string> = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-accent",
};

/** In-flight states get a gently pulsing dot so "Claudia is working" reads at a glance. */
const LIVE_STATUSES = new Set(["running", "pending", "queued", "in_progress"]);

type StatusTextProps = {
  status: string;
  className?: string;
};

/**
 * Design rule: no Chip/pill badges — a status renders as a small semantic dot
 * plus plain colored text (grey for neutral states). Shared by every table and
 * list that shows a run/article/job status so they all read identically.
 */
export function StatusText({ status, className }: StatusTextProps) {
  const color = statusColor(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium capitalize tracking-[0.01em]",
        TEXT[color] ?? "text-muted",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          DOT[color] ?? "bg-muted/60",
          LIVE_STATUSES.has(status) && "animate-pulse",
        )}
      />
      {status.replace(/_/g, " ")}
    </span>
  );
}
