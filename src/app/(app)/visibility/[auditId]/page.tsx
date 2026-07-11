"use client";

import { Button, Card } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { use } from "react";
import { ScoreGauge } from "@/components/dashboard/score-gauge";
import { Section } from "@/components/feedback/section";
import { CardSkeleton, StatGridSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { useVisibilityReport, type VisibilityReport } from "@/lib/api/queries";
import { SubScoreTile } from "@/components/visibility/subscore-tile";

/** V6.1: in-app report view: score dashboard + findings + Markdown/PDF export. */

const fmt = (n: number | null) => (n == null ? "N/A" : `${Math.round(n)}`);

const reportSkeleton = (
  <div className="space-y-6">
    <CardSkeleton lines={2} />
    <StatGridSkeleton tiles={6} />
    <CardSkeleton lines={4} />
  </div>
);

function ReportContent({ model }: { model: VisibilityReport["model"] }) {
  return (
    <>
      <Card className="material-panel p-5 sm:p-6">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <ScoreGauge value={model.overall} size={110} barSize={8}>
            <span className="text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
              {fmt(model.overall)}
            </span>
          </ScoreGauge>
          <div>
            <p className="text-sm tracking-[0.01em] text-default-500">Overall visibility</p>
            <p className="type-title text-xl">{model.band}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-default-600">{model.impact}</p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {model.subScores.map((s) => (
          <SubScoreTile key={s.key} subScoreKey={s.key} label={s.label} score={s.score} />
        ))}
      </div>

      <Card className="material-panel p-5">
        <h2 className="type-title mb-2.5 text-base">Quick wins</h2>
        <ul className="space-y-2.5 text-sm leading-relaxed">
          {model.quickWins.map((f, i) => (
            <li key={i}>
              <span className="font-medium tracking-tight">{f.title}</span>: {f.recommendation}
            </li>
          ))}
          {model.quickWins.length === 0 && (
            <li className="text-default-400">None outstanding.</li>
          )}
        </ul>
      </Card>

      {model.themes.map((t) => (
        <Card key={t.week} className="material-panel p-5">
          <h2 className="type-title mb-2.5 text-base">
            Week {t.week}: {t.title}
          </h2>
          <ul className="space-y-2.5 text-sm leading-relaxed">
            {t.findings.map((f, i) => (
              <li key={i}>
                <span className="font-medium tracking-tight">{f.title}</span>: {f.recommendation}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}

export default function ReportPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params);
  const report = useVisibilityReport(auditId);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-9">
      <PageHeader
        title="Visibility report"
        description={report.data?.model.site ?? "Your full audit, scored and prioritized."}
        meta={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              isDisabled={!report.data}
              onPress={() => navigator.clipboard.writeText(report.data?.markdown ?? "")}
            >
              Copy Markdown
            </Button>
            <a
              className={buttonVariants({ size: "sm", variant: "primary" })}
              href={`/api/visibility/${auditId}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Download PDF
            </a>
          </div>
        }
      />

      <Section query={report} skeleton={reportSkeleton} errorLabel="Couldn't load this report.">
        {(data) => <ReportContent model={data.model} />}
      </Section>
    </div>
  );
}
