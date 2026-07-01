"use client";

import { Spinner } from "@heroui/react";

/** Full-area loading spinner for client pages while their data resolves. */
export function PageLoader({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
