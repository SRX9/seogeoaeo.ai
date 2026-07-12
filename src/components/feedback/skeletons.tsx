"use client";

import { Skeleton } from "@heroui/react";
import { cn } from "@/lib/cn";

/**
 * Section-shaped skeleton placeholders. Each mirrors the real layout (frame,
 * grid, row heights) so swapping the live content in causes no layout shift.
 * Material frames match Apple-style floating panels used across the app.
 */

/** A single sized shimmer box. */
function Box({ className }: { className?: string }) {
  return <Skeleton className={cn("rounded-lg", className)} />;
}

/** Card surface frame matching material-panel cards. */
function CardFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("material-panel rounded-2xl p-4", className)}>{children}</div>
  );
}

/** Grid of stat tiles: matches proof strip / score grids. */
export function StatGridSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: tiles }).map((_, i) => (
        <CardFrame key={i}>
          <Box className="h-4 w-20" />
          <Box className="mt-3 h-7 w-16" />
        </CardFrame>
      ))}
    </div>
  );
}

/** Title + description + a few body lines: for cards and form sections. */
export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <CardFrame className={className}>
      <Box className="h-5 w-40" />
      <Box className="mt-2 h-4 w-56" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Box key={i} className="h-4 w-full" />
        ))}
      </div>
    </CardFrame>
  );
}

/** Placeholder rows for tables / lists (recent articles, articles, activity). */
export function TableSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="material-panel flex items-center justify-between gap-4 rounded-xl p-4"
        >
          <Box className="h-4 w-1/2" />
          <Box className="h-4 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** A single text line; pass a width via className. */
function ChipSkeleton({ className }: { className?: string }) {
  return <Box className={cn("h-6 w-20 rounded-full", className)} />;
}

/** A row of chip placeholders, for a `PageHeader` meta row. */
export function ChipRowSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <ChipSkeleton key={i} />
      ))}
    </div>
  );
}
