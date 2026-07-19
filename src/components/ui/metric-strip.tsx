import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneTextClass, type StatusTone } from "@/lib/ui/status";

export type MetricStripItem = {
  id: string;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: StatusTone;
};

type MetricStripProps = {
  items: MetricStripItem[];
  label?: string;
  className?: string;
};

/** Related metrics share one aligned surface instead of becoming separate cards. */
export function MetricStrip({ items, label = "Summary metrics", className }: MetricStripProps) {
  return (
    <dl
      aria-label={label}
      className={cn(
        "grid gap-px overflow-hidden rounded-[var(--radius-lg)] bg-separator shadow-[var(--surface-shadow)] [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.id} className="min-w-0 bg-surface px-4 py-4 sm:px-5">
          <dt className="text-sm font-medium leading-5 text-muted">{item.label}</dt>
          <dd
            className={cn(
              "mt-1 text-2xl font-semibold leading-[1.2] tracking-[-0.02em] text-foreground tabular-nums",
              item.tone && toneTextClass(item.tone),
            )}
          >
            {item.value}
          </dd>
          {item.detail ? (
            <p className="mt-1 text-pretty text-xs leading-4 text-muted">{item.detail}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
