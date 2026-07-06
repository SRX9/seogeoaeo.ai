import { Button, buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import { ScoreGauge } from "@/components/dashboard/score-gauge";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon } from "@/components/icons";
import { cn } from "@/lib/cn";
import type { VisibilitySubScoreKey, VisibilitySummary } from "@/lib/api/queries";
import { SUBSCORE_EXPLAINERS, SUBSCORE_LABELS } from "@/lib/visibility/display";

const KEYS: VisibilitySubScoreKey[] = [
  "citability",
  "brand",
  "eeat",
  "technical",
  "schema",
  "platform",
];

const fmt = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}`);

/**
 * Overview visibility snapshot — the "is it working?" proof. A big radial gauge
 * for the 0–100 score (never bare: delta vs last audit + industry baseline),
 * six sub-score circle gauges, and deep links to the report, fix queue, and AI
 * answers. Empty state hands off to /visibility where Claudia runs the first audit.
 */
export function VisibilitySnapshot({ summary }: { summary: VisibilitySummary }) {
  const latest = summary.latest;
  const overall = latest?.overall ?? null;
  const delta =
    overall != null && summary.previousOverall != null
      ? Math.round(overall - summary.previousOverall)
      : null;
  const baseline = summary.baseline.baseline;

  const reportHref = latest ? `/visibility/${latest.id}` : "/visibility";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Visibility</h2>
        <Link
          href={reportHref}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
        >
          {summary.hasAudit ? "Full report" : "Open visibility"}
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>

      <Card className="p-5 sm:p-6">
        {summary.hasAudit ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
              {/* Overall score */}
              <div className="flex flex-col items-center gap-2 lg:w-56 lg:shrink-0">
                <ScoreGauge value={overall} size={188} barSize={12}>
                  <span className="text-4xl font-semibold leading-none text-foreground tabular-nums">
                    {fmt(overall)}
                  </span>
                  <span className="mt-1 text-xs text-muted">
                    / 100{latest?.band ? ` · ${latest.band}` : ""}
                  </span>
                </ScoreGauge>
                <div className="text-center text-sm">
                  {delta != null ? (
                    <p
                      className={cn(
                        "inline-flex items-center gap-1 tabular-nums",
                        delta >= 0 ? "text-success" : "text-danger",
                      )}
                    >
                      {delta >= 0 ? (
                        <ArrowUpIcon className="size-3.5" />
                      ) : (
                        <ArrowDownIcon className="size-3.5" />
                      )}
                      {Math.abs(delta)} vs last audit
                    </p>
                  ) : (
                    <p className="text-muted">First reading</p>
                  )}
                  {baseline != null ? (
                    <p className="text-muted tabular-nums">Typical: {Math.round(baseline)}</p>
                  ) : null}
                </div>
              </div>

              {/* Sub-scores */}
              <div className="grid flex-1 grid-cols-3 gap-x-2 gap-y-5 sm:grid-cols-6">
                {KEYS.map((k) => (
                  <div
                    key={k}
                    className="flex flex-col items-center gap-1.5 text-center"
                    title={SUBSCORE_EXPLAINERS[k]}
                  >
                    <ScoreGauge value={latest?.subScores[k] ?? null} size={78} barSize={7}>
                      <span className="text-base font-semibold leading-none text-foreground tabular-nums">
                        {fmt(latest?.subScores[k])}
                      </span>
                    </ScoreGauge>
                    <span className="text-xs leading-tight text-muted">{SUBSCORE_LABELS[k]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/visibility/fixes"
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                Fix queue
              </Link>
              <Link
                href="/visibility/answers"
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                AI answers
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 py-2 text-center sm:flex-row sm:text-left">
            <ScoreGauge value={null} size={120} barSize={9}>
              <span className="text-2xl font-semibold text-default-400">—</span>
            </ScoreGauge>
            <div className="space-y-3">
              <div>
                <p className="text-base font-medium text-foreground">No visibility reading yet</p>
                <p className="mt-1 max-w-md text-sm text-muted">
                  Claudia runs your first audit during setup — one 0–100 score for how easily
                  people and AI assistants can find and cite your site, plus a prioritized fix list.
                </p>
              </div>
              <Link href="/visibility" className="inline-block">
                <Button size="sm">Open visibility</Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
