"use client";

import { Card, Skeleton } from "@heroui/react";
import { cn } from "@/lib/cn";

/**
 * Section-shaped skeleton placeholders. Each mirrors the real layout (frame,
 * grid, row heights) so swapping the live content in causes no layout shift.
 * Only content-shaped elements shimmer. The surrounding frames stay transparent
 * so loading never introduces temporary card backgrounds or borders.
 */

/** A single sized shimmer box. */
function Box({ className }: { className?: string }) {
  return <Skeleton className={cn("rounded-lg", className)} />;
}

/** Transparent layout frame matching card padding without drawing its surface. */
function CardFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return <Card variant="transparent" className={cn("p-4", className)}>{children}</Card>;
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
          className="flex items-center justify-between gap-4 p-4"
        >
          <Box className="h-4 w-1/2" />
          <Box className="h-4 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
