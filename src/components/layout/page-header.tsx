import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  /** Trailing controls (buttons, toggles) aligned to the end on wide screens. */
  actions?: ReactNode;
  /** Inline status chips / meta rendered under the description. */
  meta?: ReactNode;
  className?: string;
};

/**
 * Consistent page title block used across every app view: a Title-Case heading,
 * muted one-line description, optional meta row, and end-aligned actions. Keeps
 * spacing and hierarchy uniform per DESIGN.md (general-to-specific, no decoration).
 */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
    </div>
  );
}
