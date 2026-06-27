"use client";

import { Button, Spinner } from "@heroui/react";
import type { ReactNode } from "react";
import { getErrorMessage } from "@/lib/api/fetcher";

/** Full-area loading spinner for client pages while their data resolves. */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

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

/** Small inline spinner for in-card / in-list async sections. */
export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted">
      <Spinner size="sm" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
