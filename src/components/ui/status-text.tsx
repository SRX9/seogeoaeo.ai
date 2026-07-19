import type { PropsWithChildren } from "react";
import { cn } from "@/lib/cn";
import { statusColor, toneTextClass, type StatusTone } from "@/lib/ui/status";

type StatusTextProps = {
  status: string;
  withDot?: boolean;
  className?: string;
};

type ToneTextProps = PropsWithChildren<{
  tone?: StatusTone;
  withDot?: boolean;
  className?: string;
}>;

/** Text-only semantic emphasis. Never renders a chip, pill, badge, or filled background. */
export function ToneText({ tone = "default", withDot = false, className, children }: ToneTextProps) {
  return (
    <span
      className={cn(
        "text-sm font-medium tracking-[0.01em]",
        withDot && "inline-flex items-center gap-1.5",
        toneTextClass(tone),
        className,
      )}
    >
      {withDot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/**
 * Design rule: no Chip/pill badges: a status renders as plain semantic text
 * (grey for neutral states). Shared by every table and
 * list that shows a run/article/job status so they all read identically.
 */
export function StatusText({ status, withDot = false, className }: StatusTextProps) {
  return (
    <ToneText
      tone={statusColor(status)}
      withDot={withDot}
      className={cn("capitalize", className)}
    >
      {status.replace(/_/g, " ")}
    </ToneText>
  );
}
