"use client";

import { Button } from "@heroui/react";
import { useEffect } from "react";
import { logError } from "@/lib/logging/logger";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    logError("ui.error_boundary", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted">
        An unexpected error occurred in the dashboard. You can retry or return to the overview.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onPress={reset}>Try again</Button>
        <Button variant="secondary" onPress={() => window.location.assign("/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
