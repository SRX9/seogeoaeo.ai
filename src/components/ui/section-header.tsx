import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  headingId?: string;
  compact?: boolean;
  className?: string;
};

/** A flat section heading with one clearly separated trailing action. */
export function SectionHeader({
  title,
  description,
  action,
  headingId,
  compact = false,
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h2
          id={headingId}
          className={cn(
            "text-balance font-semibold tracking-[-0.02em] text-foreground",
            compact ? "text-base leading-[1.375]" : "text-2xl leading-[1.2]",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-pretty text-sm leading-5 text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
