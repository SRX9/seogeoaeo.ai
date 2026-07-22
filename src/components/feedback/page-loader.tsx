"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";

/** Full-area thinking indicator for client pages while their data resolves. */
export function PageLoader({
  label = "Loading...",
  state = "working",
}: {
  label?: string;
  state?: OrbState;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted" role="status">
      <ThinkingOrb state={state} size={64} aria-hidden />
      <p className="text-sm tracking-[0.01em]">{label}</p>
    </div>
  );
}
