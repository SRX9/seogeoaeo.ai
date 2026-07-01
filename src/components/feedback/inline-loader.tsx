"use client";

import { Spinner } from "@heroui/react";

/** Small inline spinner for in-card / in-list async sections. */
export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted">
      <Spinner size="sm" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}
