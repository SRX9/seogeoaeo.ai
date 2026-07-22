"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";

/** Small thinking indicator for in-card / in-list async sections. */
export function InlineLoader({
  label,
  state = "working",
}: {
  label?: string;
  state?: OrbState;
}) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm tracking-[0.01em] text-muted" role="status">
      <ThinkingOrb state={state} size={20} aria-hidden />
      {label ? <span>{label}</span> : null}
      {!label ? <span className="sr-only">Loading</span> : null}
    </div>
  );
}
