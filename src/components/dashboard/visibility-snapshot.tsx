import { Card, ProgressCircle, buttonVariants } from "@heroui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { VisibilitySubScoreKey, VisibilitySummary } from "@/lib/api/queries";
import { SUBSCORE_EXPLAINERS, SUBSCORE_LABELS } from "@/lib/visibility/display";

const KEYS: VisibilitySubScoreKey[] = ["citability", "brand", "eeat", "technical", "schema", "platform"];
const fmt = (value: number | null | undefined) => value == null ? "N/A" : `${Math.round(value)}`;

function scoreColor(score: number | null | undefined): "default" | "danger" | "warning" | "accent" | "success" {
  if (score == null) return "default";
  if (score >= 75) return "success";
  if (score >= 60) return "accent";
  if (score >= 40) return "warning";
  return "danger";
}

function ScoreCircle({ value, size, children }: { value: number | null | undefined; size: "sm" | "md" | "lg"; children: ReactNode }) {
  return (
    <div className="relative grid place-items-center">
      <ProgressCircle
        aria-label={value == null ? "No visibility score" : `Visibility score ${Math.round(value)} of 100`}
        color={scoreColor(value)}
        size={size}
        value={value ?? 0}
      >
        <ProgressCircle.Track>
          <ProgressCircle.TrackCircle />
          <ProgressCircle.FillCircle />
        </ProgressCircle.Track>
      </ProgressCircle>
      <span className="pointer-events-none absolute inset-0 grid place-items-center text-center">{children}</span>
    </div>
  );
}

export function VisibilitySnapshot({ summary }: { summary: VisibilitySummary }) {
  const latest = summary.latest;
  const overall = latest?.overall ?? null;
  const delta = overall != null && summary.previousOverall != null
    ? Math.round(overall - summary.previousOverall)
    : null;
  const baseline = summary.baseline.baseline;
  const reportHref = latest ? `/visibility/${latest.id}` : "/visibility";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Visibility</h2>
        <Link href={reportHref} className="inline-flex items-center gap-1 text-sm text-muted no-underline hover:text-foreground">
          {summary.hasAudit ? "Full report" : "Open visibility"}
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>

      <Card>
        {summary.hasAudit ? (
          <>
            <Card.Content className="space-y-6">
              <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
                <div className="flex flex-col items-center gap-2 lg:w-56 lg:shrink-0">
                  <ScoreCircle value={overall} size="lg">
                    <span className="text-lg font-semibold leading-none text-foreground tabular-nums">{fmt(overall)}</span>
                  </ScoreCircle>
                  {latest?.band ? <span className="text-xs text-muted">{latest.band}</span> : null}
                  <div className="text-center text-sm">
                    {delta != null ? (
                      <p className={cn("inline-flex items-center gap-1 tabular-nums", delta >= 0 ? "text-success" : "text-danger")}>
                        {delta >= 0 ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />}
                        {Math.abs(delta)} vs last audit
                      </p>
                    ) : <p className="text-muted">First reading</p>}
                    {baseline != null ? <p className="text-muted tabular-nums">Typical: {Math.round(baseline)}</p> : null}
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6">
                  {KEYS.map((key) => (
                    <div key={key} className="flex flex-col items-center gap-1.5 text-center" title={SUBSCORE_EXPLAINERS[key]}>
                      <ScoreCircle value={latest?.subScores[key] ?? null} size="sm">
                        <span className="text-xs font-semibold leading-none text-foreground tabular-nums">{fmt(latest?.subScores[key])}</span>
                      </ScoreCircle>
                      <span className="text-xs leading-tight text-muted">{SUBSCORE_LABELS[key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card.Content>
            <Card.Footer className="flex-wrap gap-2">
              <Link href="/visibility/fixes" className={buttonVariants({ size: "sm", variant: "secondary" })}>Fix queue</Link>
              <Link href="/visibility/answers" className={buttonVariants({ size: "sm", variant: "secondary" })}>AI answers</Link>
            </Card.Footer>
          </>
        ) : (
          <Card.Content className="flex flex-col items-center gap-5 py-8 text-center sm:flex-row sm:text-left">
            <ScoreCircle value={null} size="lg"><span className="text-sm font-semibold text-muted">N/A</span></ScoreCircle>
            <div className="space-y-3">
              <div>
                <p className="text-base font-medium text-foreground">No Visibility Reading Yet</p>
                <p className="mt-1 max-w-md text-sm leading-6 text-muted">
                  Claudia runs your first audit during setup, then orders the resulting fixes by impact.
                </p>
              </div>
              <Link href="/visibility" className={buttonVariants({ size: "sm" })}>Open visibility</Link>
            </div>
          </Card.Content>
        )}
      </Card>
    </section>
  );
}
