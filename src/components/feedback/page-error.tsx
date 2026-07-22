"use client";

import { Card } from "@heroui/react";
import { useState, type ReactNode } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { getErrorMessage } from "@/lib/api/fetcher";

/** Full-area error state with an optional retry. */
export function PageError({
  error,
  onRetry,
  children,
}: {
  error?: unknown;
  onRetry?: () => unknown;
  children?: ReactNode;
}) {
  const message = getErrorMessage(error, "Something went wrong loading this page.");
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
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <Card.Header>
          <Card.Title>Something Went Wrong</Card.Title>
          <Card.Description>{message}</Card.Description>
        </Card.Header>
        {children ? <Card.Content>{children}</Card.Content> : null}
        {onRetry ? (
          <Card.Footer className="justify-center">
            <LoadingButton variant="secondary" size="sm" isPending={isRetrying} onPress={() => void retry()}>Try Again</LoadingButton>
          </Card.Footer>
        ) : null}
      </Card>
    </div>
  );
}
