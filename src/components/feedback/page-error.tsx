"use client";

import { Button, Card } from "@heroui/react";
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
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <Card.Header>
          <Card.Title>Something Went Wrong</Card.Title>
          <Card.Description>{message}</Card.Description>
        </Card.Header>
        {children ? <Card.Content>{children}</Card.Content> : null}
        {onRetry ? (
          <Card.Footer className="justify-center">
            <Button variant="secondary" size="sm" onPress={onRetry}>Try Again</Button>
          </Card.Footer>
        ) : null}
      </Card>
    </div>
  );
}
