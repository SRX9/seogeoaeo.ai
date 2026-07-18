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

export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <h1 className="sr-only">{title}</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {description ? (
          <p className="max-w-2xl text-pretty text-sm leading-6 text-muted">{description}</p>
        ) : (
          <span />
        )}
        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-3 text-sm text-muted">{meta}</div> : null}
    </header>
  );
}
