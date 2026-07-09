"use client";

import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, WorkshopIcon } from "@/components/icons";
import {
  isWorkshopPath,
  workshopLinkForPath,
  WORKSHOP_LINKS,
} from "@/lib/workshop/routes";
import { cn } from "@/lib/cn";

/**
 * Phase 6 — chrome for power-user Workshop pages.
 * Reminds owners this is advanced, links back to Claudia, and offers sibling tools.
 */
export function WorkshopBanner() {
  const pathname = usePathname();
  if (!isWorkshopPath(pathname)) return null;

  const current = workshopLinkForPath(pathname);

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-surface-secondary/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
            <WorkshopIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Workshop
              {current ? (
                <span className="font-normal text-muted"> · {current.title}</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-muted sm:text-sm">
              Advanced — you don&apos;t need this for Claudia to work. Most owners stay on her
              home, Inbox, and Reports.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ size: "sm", variant: "secondary" }), "gap-1.5")}
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to Claudia
          </Link>
          <Link
            href="/settings?tab=workshop"
            className={buttonVariants({ size: "sm", variant: "ghost" })}
          >
            All tools
          </Link>
        </div>
      </div>

      <nav aria-label="Workshop tools" className="flex flex-wrap gap-1.5">
        {WORKSHOP_LINKS.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-secondary text-muted hover:text-foreground",
              )}
            >
              {link.title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
