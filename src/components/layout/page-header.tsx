import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Trailing controls aligned to the end on wide screens. */
  actions?: ReactNode;
  /** Inline status or contextual metadata below the description. */
  meta?: ReactNode;
  className?: string;
};

/**
 * Stable page context for product views. Floating material is reserved for
 * navigation and overlays; routine headers do not morph while users scroll.
 */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 pt-2", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold leading-tight tracking-[-0.025em] text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </header>
  );
}
