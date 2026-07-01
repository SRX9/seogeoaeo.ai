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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="max-w-md text-sm text-muted">{message}</p>
      {children}
      {onRetry ? (
        <Button variant="secondary" size="sm" onPress={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
