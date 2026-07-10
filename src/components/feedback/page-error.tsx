"use client";

import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { getErrorMessage } from "@/lib/api/fetcher";

/** Full-area error state with an optional retry. */
export function PageError({
  error,
  onRetry,
  children,
}: {
  error?: unknown;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const message = getErrorMessage(error, "Something went wrong loading this page.");
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="material-panel max-w-md space-y-3 rounded-2xl p-6">
        <p className="type-title text-base text-foreground">Something went wrong</p>
        <p className="text-sm leading-relaxed text-muted">{message}</p>
        {children}
        {onRetry ? (
          <Button variant="secondary" size="sm" onPress={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}
