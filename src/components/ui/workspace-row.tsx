import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type WorkspaceRowProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  end?: ReactNode;
  href?: string | null;
  className?: string;
};

/**
 * Shared anatomy for repeatable work. Keep `end` informational when `href` is
 * set so the row does not contain nested interactive controls.
 */
export function WorkspaceRow({
  title,
  description,
  icon,
  meta,
  end,
  href,
  className,
}: WorkspaceRowProps) {
  const rowClassName = cn(
    "grid min-h-14 items-center gap-3 border-b border-separator px-3 py-3 last:border-b-0 sm:px-4",
    icon
      ? "grid-cols-[auto_minmax(0,1fr)_auto]"
      : "grid-cols-[minmax(0,1fr)_auto]",
    href &&
      "transition-[background-color] duration-150 ease-out hover:bg-default/55 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
    className,
  );

  const content = (
    <>
      {icon ? (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-secondary text-muted [&_svg]:size-4"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-[1.375] text-foreground">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block max-w-3xl text-pretty text-sm leading-5 text-muted">
            {description}
          </span>
        ) : null}
        {meta ? (
          <span className="mt-1 block text-xs leading-4 text-muted">{meta}</span>
        ) : null}
      </span>
      {end ? (
        <span className="justify-self-end text-end text-sm leading-5 text-muted">{end}</span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(rowClassName, "no-underline")}>
        {content}
      </Link>
    );
  }

  return <div className={rowClassName}>{content}</div>;
}
