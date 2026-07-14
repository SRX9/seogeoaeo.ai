import type { PropsWithChildren } from "react";
import { cn } from "@/lib/cn";
import { statusColor, toneTextClass, type StatusTone } from "@/lib/ui/status";

type StatusTextProps = {
  status: string;
  className?: string;
};

type ToneTextProps = PropsWithChildren<{
  tone?: StatusTone;
  className?: string;
}>;

/** Text-only semantic emphasis. Never renders a chip, pill, badge, or filled background. */
export function ToneText({ tone = "default", className, children }: ToneTextProps) {
  return (
    <span className={cn("text-sm font-medium tracking-[0.01em]", toneTextClass(tone), className)}>
      {children}
    </span>
  );
}

/**
 * Design rule: no Chip/pill badges: a status renders as plain semantic text
 * (grey for neutral states). Shared by every table and
 * list that shows a run/article/job status so they all read identically.
 */
export function StatusText({ status, className }: StatusTextProps) {
  return (
    <ToneText tone={statusColor(status)} className={cn("capitalize", className)}>
      {status.replace(/_/g, " ")}
    </ToneText>
  );
}
