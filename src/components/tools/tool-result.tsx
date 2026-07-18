"use client";

import { buttonVariants } from "@heroui/react/button";
import { Accordion, Card, ProgressBar } from "@heroui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon, ChevronRightIcon, CircleCheckIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { scoreBand } from "@/lib/visibility/display";

export type ToolFindingView = {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  recommendation: string;
};

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
  if (value == null || value === "") return <span className="text-muted">No result</span>;
  if (typeof value === "boolean") {
    return value ? <span className="text-success">Yes</span> : <span className="text-danger">No</span>;
  }
  if (typeof value === "number") {
    return <span className="tabular-nums">{Number.isInteger(value) ? value : value.toFixed(1)}</span>;
  }
  if (typeof value === "string") return <span className="break-words">{value}</span>;

  if (depth >= MAX_DEPTH) {
    return (
      <pre className="max-h-48 overflow-auto rounded-xl bg-surface-secondary p-3 text-xs leading-5 text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted">None</span>;
    if (value.every((item) => typeof item !== "object" || item === null)) {
      return <span className="break-words">{value.map((item) => String(item)).join(", ")}</span>;
    }
    return (
      <div className="space-y-2">
        {keyedValues(value).map(({ item, key }) => (
          <div key={key} className="rounded-xl bg-surface-secondary p-3">
            <DataValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    if (entries.length === 0) return <span className="text-muted">No result</span>;
    return (
      <dl className="space-y-3">
        {entries.map(([key, item]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-xs font-medium text-muted">{humanizeKey(key)}</dt>
            <dd className="min-w-0 text-sm leading-6 text-foreground">
              <DataValue value={item} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return <span>{String(value)}</span>;
}

function severityColor(severity: ToolFindingView["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "high" || severity === "medium") return "warning" as const;
  return "default" as const;
}

function scoreColor(score: number) {
  if (score >= 70) return "success" as const;
  if (score >= 40) return "warning" as const;
  return "danger" as const;
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
  freshRun: boolean;
}) {
  return (
    <Card>
      <Card.Header className="flex-row flex-wrap items-start justify-between gap-4 p-5 pb-3 sm:p-6 sm:pb-3">
        <div>
          <Card.Title>Latest Result</Card.Title>
          <Card.Description>
            {freshRun ? "Completed just now" : ranAt ? `Last run ${new Date(ranAt).toLocaleString()}` : "Saved analyzer result"}
          </Card.Description>
        </div>
        {score != null ? (
          <ToneText tone={scoreColor(score)}>
            {scoreBand(score)}
          </ToneText>
        ) : null}
      </Card.Header>

      <Card.Content className="space-y-8 px-5 pb-5 sm:px-6 sm:pb-6">
        {score != null ? (
          <section aria-labelledby="tool-score-title" className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p id="tool-score-title" className="text-sm font-medium text-muted">Overall score</p>
                <p className="mt-1 text-3xl font-semibold leading-none tracking-tight tabular-nums">
                  {Math.round(score)}
                  <span className="ml-1 text-sm font-normal text-muted">/ 100</span>
                </p>
              </div>
              <p className="text-xs text-muted">{findings.length} open {findings.length === 1 ? "finding" : "findings"}</p>
            </div>
            <ProgressBar aria-label="Tool score" color={scoreColor(score)} value={score}>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          </section>
        ) : null}

        <section aria-labelledby="tool-findings-title" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="tool-findings-title" className="text-base font-semibold tracking-tight">
                Findings
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Prioritized issues from this analyzer run.
              </p>
            </div>
            {findings.length > 0 ? (
              <Link
                href="/visibility/fixes"
                className={buttonVariants({ size: "sm", variant: "outline" })}
              >
                Open fix queue
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            ) : null}
          </div>

          {findings.length > 0 ? (
            <div className="divide-y divide-separator">
              {findings.map((finding) => (
                <article
                  key={`${finding.severity}:${finding.title}:${finding.recommendation}`}
                  className="py-4 first:pt-1 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneText tone={severityColor(finding.severity)} className="text-xs capitalize">
                      {finding.severity}
                    </ToneText>
                    <h3 className="text-sm font-medium tracking-tight">{finding.title}</h3>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                    {finding.recommendation}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-success-soft p-4 text-sm text-success-soft-foreground">
              <CircleCheckIcon className="size-5 shrink-0 text-success" aria-hidden />
              No unresolved findings were returned by this run.
            </div>
          )}
        </section>

        {data != null ? (
          <section aria-labelledby="tool-details-title" className="space-y-3">
            <div>
              <h2 id="tool-details-title" className="text-base font-semibold tracking-tight">
                Details
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                Structured analyzer output and supporting measurements.
              </p>
            </div>
            <DataValue value={data} depth={0} />

            <Accordion>
              <Accordion.Item id="raw-json">
                <Accordion.Heading>
                  <Accordion.Trigger>
                    Raw JSON
                    <Accordion.Indicator>
                      <ChevronRightIcon className="size-4" aria-hidden />
                    </Accordion.Indicator>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <pre className="max-h-80 overflow-auto rounded-xl bg-surface-secondary p-4 text-xs leading-5 text-foreground">
                      {JSON.stringify(data, null, 2)}
                    </pre>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </section>
        ) : null}
      </Card.Content>
    </Card>
  );
}
