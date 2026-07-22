"use client";

import { Button, Card } from "@heroui/react";
import { useEffect, useTransition } from "react";
import posthog from "posthog-js";
import { LoadingButton } from "@/components/ui/loading-button";
import { logError } from "@/lib/logging/logger";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: ErrorPageProps) {
  const [isRetrying, startRetry] = useTransition();
  useEffect(() => {
    logError("ui.error_boundary", {
      message: error.message,
      digest: error.digest,
    });
    posthog.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <Card className="w-full">
        <Card.Header className="items-center text-center">
          <Card.Title>Something went wrong</Card.Title>
          <Card.Description className="max-w-sm text-pretty">
            We couldn&apos;t load this page. Try again or return to your dashboard.
          </Card.Description>
        </Card.Header>
        <Card.Footer className="flex-wrap justify-center gap-2">
          <LoadingButton isPending={isRetrying} onPress={() => startRetry(reset)}>Try again</LoadingButton>
          <Button variant="outline" onPress={() => window.location.assign("/dashboard")}>
            Go to dashboard
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
