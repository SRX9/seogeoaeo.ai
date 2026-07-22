"use client";

import { Card } from "@heroui/react";
import { Component, useState, type ReactNode } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { ApiError, getErrorMessage } from "@/lib/api/fetcher";
import type { QueryLike } from "@/lib/api/queries";

/** The workspace has no brand yet (mid-onboarding): a transient state, not a
 * failure: render the skeleton instead of an error card. */
function isNoBrandError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    typeof error.details === "object" &&
    error.details !== null &&
    (error.details as { details?: { code?: string } }).details?.code === "NO_BRAND"
  );
}

/**
 * Per-section async wrapper. Renders one page section independently: a skeleton
 * while its data loads, a scoped error card (with retry) if its fetch fails, and
 * the content once data is present: so one slow or failing section never blanks
 * the whole page. A render-time error inside the section is caught by an internal
 * error boundary and shown the same way, isolated to this section.
 *
 * This is the per-section counterpart to the full-page `PageLoader`/`PageError`
 * in `states.tsx`.
 */

function SectionError({
  error,
  label,
  onRetry,
}: {
  error?: unknown;
  label?: string;
  onRetry?: () => unknown;
}) {
  const message = getErrorMessage(error, label ?? "Couldn't load this section.");
  const [isRetrying, setIsRetrying] = useState(false);
  const retry = async () => {
    setIsRetrying(true);
    try {
      await onRetry?.();
    } finally {
      setIsRetrying(false);
    }
  };
  return (
    <Card>
      <Card.Header>
        <Card.Title>Couldn’t Load This Section</Card.Title>
        <Card.Description>{message}</Card.Description>
      </Card.Header>
      {onRetry ? (
        <Card.Footer>
          <LoadingButton variant="secondary" size="sm" isPending={isRetrying} onPress={() => void retry()}>Try Again</LoadingButton>
        </Card.Footer>
      ) : null}
    </Card>
  );
}

/** Catches render-time errors within a section and shows a recoverable fallback. */
class SectionErrorBoundary extends Component<
  { children: ReactNode; fallback: (reset: () => void, error: unknown) => ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error != null) {
      return this.props.fallback(this.reset, this.state.error);
    }
    return this.props.children;
  }
}

export function Section<T>({
  query,
  skeleton,
  errorLabel,
  children,
}: {
  query: QueryLike<T>;
  skeleton: ReactNode;
  /** Contextual fallback message when the error isn't user-facing. */
  errorLabel?: string;
  children: (data: T) => ReactNode;
}) {
  // Fetch failed and we have nothing cached to show.
  if (query.error != null && query.data === undefined && !isNoBrandError(query.error)) {
    return <SectionError error={query.error} label={errorLabel} onRetry={() => query.refetch()} />;
  }
  // Still loading (no data yet): show the section's skeleton.
  if (query.data === undefined) {
    return <>{skeleton}</>;
  }

  const data = query.data;
  return (
    <SectionErrorBoundary
      fallback={(reset, error) => (
        <SectionError
          error={error}
          label={errorLabel}
          onRetry={() => {
            query.refetch();
            reset();
          }}
        />
      )}
    >
      {children(data)}
    </SectionErrorBoundary>
  );
}
