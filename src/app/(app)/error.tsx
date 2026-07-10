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
      <div className="material-panel w-full space-y-4 rounded-2xl p-8">
        <h1 className="type-title text-2xl text-foreground">Something went wrong</h1>
        <p className="text-sm leading-relaxed text-muted">
          An unexpected error occurred in the dashboard. You can retry or return to the overview.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button onPress={reset}>Try again</Button>
          <Button variant="secondary" onPress={() => window.location.assign("/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
