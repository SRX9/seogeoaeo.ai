"use client";

import { buttonVariants } from "@heroui/react/button";
import Link from "next/link";
import type { ReactNode } from "react";
import { scoreBand } from "@/lib/visibility/display";

/**
 * V8.3: renders one Toolbox run as a readable result instead of raw JSON:
 * score + band, the findings it raised, and a generic key/value view of the
 * analyzer's data payload (raw JSON stays available behind a disclosure).
 */

export type ToolFindingView = {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  recommendation: string;
};

const SEVERITY_DOT: Record<ToolFindingView["severity"], string> = {
  critical: "bg-danger",
  high: "bg-warning",
  medium: "bg-accent",
  low: "bg-default-300",
};

/** "wordCount" / "word_count" → "Word count". */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

const MAX_DEPTH = 3;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyedValues(values: unknown[]): Array<{ item: unknown; key: string }> {
  const seen = new Map<string, number>();
  return values.map((item) => {
    const base = JSON.stringify(item) ?? String(item);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { item, key: `${base}:${occurrence}` };
  });
}

function DataValue({ value, depth }: { value: unknown; depth: number }): ReactNode {
  if (value == null || value === "") return <span className="text-default-400">No result</span>;
  if (typeof value === "boolean") {
    return value ? (
      <span className="text-success">Yes</span>
    ) : (
      <span className="text-danger">No</span>
    );
  }
  if (typeof value === "number") {
    return <span className="tabular-nums">{Number.isInteger(value) ? value : value.toFixed(1)}</span>;
  }
  if (typeof value === "string") {
    return <span className="break-words">{value}</span>;
  }
  if (depth >= MAX_DEPTH) {
    return (
      <pre className="max-h-48 overflow-auto rounded-xl bg-default-100 p-2.5 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-default-400">None</span>;
    if (value.every((v) => typeof v !== "object" || v === null)) {
      return <span className="break-words">{value.map((v) => String(v)).join(", ")}</span>;
    }
    return (
      <div className="space-y-2">
        {keyedValues(value).map(({ item, key }) => (
          <div key={key} className="border-l border-separator/70 py-1 pl-3">
            <DataValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return <span className="text-default-400">No result</span>;
    return (
      <div
        className={
          depth > 0
            ? "space-y-1.5 border-l border-border/50 pl-3"
            : "space-y-1.5"
        }
      >
        {entries.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
            <span className="w-full shrink-0 text-default-500 sm:w-52">{humanizeKey(k)}</span>
            <div className="min-w-0 flex-1 text-sm">
              <DataValue value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

export function ToolResultCard({
  score,
  ranAt,
  findings,
  data,
  freshRun,
}: {
  score: number | null;
  ranAt: string | null;
  findings: ToolFindingView[];
  data: unknown;
  /** True when this render is the run the user just triggered. */
  freshRun: boolean;
}) {
  return (
    <section className="space-y-7 border-y border-separator/70 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          {score != null ? (
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {Math.round(score)}
              <span className="text-base font-normal text-default-400">
                {" "}
                / 100 · {scoreBand(score)}
              </span>
            </p>
          ) : (
            <p className="type-title text-lg">Result</p>
          )}
        </div>
        <p className="text-xs tracking-[0.01em] text-default-400">
          {freshRun ? "Just now" : ranAt ? `Last run ${new Date(ranAt).toLocaleString()}` : null}
        </p>
      </div>

      {findings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-tight text-default-600">
            What to fix ({findings.length})
          </p>
          <div className="divide-y divide-separator/70 border-y border-separator/70">
          {findings.map((f) => (
            <div
              key={`${f.severity}:${f.title}:${f.recommendation}`}
              className="py-4"
            >
              <p className="flex items-center gap-2 text-sm font-medium tracking-tight">
                <span className={`size-2 rounded-full ${SEVERITY_DOT[f.severity]}`} aria-hidden />
                {f.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-default-500">{f.recommendation}</p>
            </div>
          ))}
          </div>
          <Link
            href="/visibility/fixes"
            className={buttonVariants({ size: "sm", variant: "secondary" })}
          >
            Open fix queue
          </Link>
        </div>
      )}

      {data != null && (
        <div className="space-y-2">
          <p className="text-sm font-semibold tracking-tight text-default-600">Details</p>
          <div className="text-sm leading-relaxed">
            <DataValue value={data} depth={0} />
          </div>
          <details className="text-xs text-default-400">
            <summary className="pressable cursor-pointer select-none tracking-[0.01em]">
              Raw JSON
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-default-100 p-3 text-xs text-foreground">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}
