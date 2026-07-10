"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, ChevronRightIcon, WorkshopIcon } from "@/components/icons";
import { isWorkshopPath, workshopLinkForPath } from "@/lib/workshop/routes";

export function WorkshopBanner() {
  const pathname = usePathname();
  if (!isWorkshopPath(pathname)) return null;
  const current = workshopLinkForPath(pathname);

  return (
    <nav
      aria-label="Workshop context"
      className="mb-7 flex min-h-11 flex-wrap items-center gap-2 text-sm text-muted"
    >
      <Link
        href="/dashboard"
        className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 hover-fine:bg-surface-secondary hover-fine:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Claudia
      </Link>
      <ChevronRightIcon className="size-3.5 opacity-60" aria-hidden />
      <Link
        href="/settings?tab=workshop"
        className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 hover-fine:bg-surface-secondary hover-fine:text-foreground"
      >
        <WorkshopIcon className="size-3.5" />
        Workshop
      </Link>
      {current ? (
        <>
          <ChevronRightIcon className="size-3.5 opacity-60" aria-hidden />
          <span className="px-2 font-medium text-foreground" aria-current="page">
            {current.title}
          </span>
        </>
      ) : null}
    </nav>
  );
}
