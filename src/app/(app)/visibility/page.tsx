"use client";

import { Button, Card } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ScoreGauge } from "@/components/dashboard/score-gauge";
import { Section } from "@/components/feedback/section";
import { CardSkeleton, StatGridSkeleton } from "@/components/feedback/skeletons";
import { ArrowRightIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import { ProofPanel } from "@/components/visibility/proof-panel";
import { SubScoreTile } from "@/components/visibility/subscore-tile";
import { ApiError } from "@/lib/api/fetcher";
import {
  queryKeys,
  useSetupInProgress,
  useVisibilitySummary,
  type VisibilitySubScoreKey,
  type VisibilitySummary,
} from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";
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

const overviewSkeleton = (
  <div className="space-y-6">
    <CardSkeleton lines={3} />
    <StatGridSkeleton tiles={6} />
  </div>
);

function OverviewContent({ summary }: { summary: VisibilitySummary }) {
  const latest = summary.latest;
  const delta =
    latest?.overall != null && summary.previousOverall != null
      ? Math.round(latest.overall - summary.previousOverall)
      : null;

  if (!summary.hasAudit) {
    return (
      <Card className="p-8 text-center">
        <p className="text-lg font-medium">No audit yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-default-500">
          Run your first audit to get one 0–100 score for how easily people and AI assistants can
          find and cite your site — plus a prioritized fix list.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <ScoreGauge value={latest?.overall} size={148} barSize={10}>
            <span className="text-3xl font-semibold leading-none text-foreground tabular-nums">
              {fmt(latest?.overall)}
            </span>
            <span className="mt-1 text-xs text-muted">/ 100</span>
          </ScoreGauge>
          <div className="text-center sm:text-left">
            <p className="text-sm text-default-500">Overall visibility</p>
            <p className="text-2xl font-semibold">{latest?.band ?? "—"}</p>
            <div className="mt-1 space-y-0.5 text-sm">
              {delta != null ? (
                <p className={delta >= 0 ? "text-success" : "text-danger"}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} vs last audit
                </p>
              ) : (
                <p className="text-muted">First reading</p>
              )}
              {summary.baseline.baseline != null && (
                <p className="text-default-400 tabular-nums">
                  Typical for your space: {Math.round(summary.baseline.baseline)}
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {KEYS.map((k) => (
          <SubScoreTile
            key={k}
            subScoreKey={k}
            label={SUBSCORE_LABELS[k]}
            score={latest?.subScores[k]}
            explainer={SUBSCORE_EXPLAINERS[k]}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/visibility/fixes" className={buttonVariants({ size: "sm", variant: "secondary" })}>
          Fix queue
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link href="/visibility/answers" className={buttonVariants({ size: "sm", variant: "secondary" })}>
          AI answers
          <ArrowRightIcon className="size-4" />
        </Link>
        {latest && (
          <Link
            href={`/visibility/${latest.id}`}
            className={buttonVariants({ size: "sm", variant: "secondary" })}
          >
            Full report
            <ArrowRightIcon className="size-4" />
          </Link>
        )}
      </div>

      <ProofPanel />
    </>
  );
}

export default function VisibilityPage() {
  const summary = useVisibilitySummary();
  const queryClient = useQueryClient();
  const [needsWebsite, setNeedsWebsite] = useState(false);
  const settingUp = useSetupInProgress();

  const runAudit = useMutation({
    // Zero-input: the server audits the active brand's website.
    mutationFn: async () => {
      const res = await fetch("/api/visibility/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 402) throw new Error("Out of credits — top up to run an audit.");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.details?.code === "NO_WEBSITE") {
          setNeedsWebsite(true);
          return;
        }
        throw new Error(body.error ?? "Failed to start audit");
      }
      // Give the audit a moment to record before refreshing the summary.
      setTimeout(
        () => queryClient.invalidateQueries({ queryKey: queryKeys.visibilitySummary }),
        4000,
      );
    },
  });

  const error = runAudit.error;
  const errorMessage =
    error == null
      ? null
      : error instanceof ApiError || error instanceof Error
        ? error.message
        : "Failed";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Visibility"
        description="How discoverable your site is across Google, answer boxes, and AI assistants."
        meta={
          <Button
            size="sm"
            variant="primary"
            isDisabled={runAudit.isPending || settingUp}
            onPress={() => runAudit.mutate()}
          >
            {runAudit.isPending ? "Starting…" : `Run audit · ${CREDIT_COSTS.visibility_audit} cr`}
          </Button>
        }
      />
      {settingUp && (
        <p className="text-sm text-muted">
          Claudia is setting up your brand — her first audit is already running as part of it.
        </p>
      )}
      {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
      {needsWebsite && (
        <p className="text-sm text-warning">
          Your brand has no website yet —{" "}
          <Link className="underline" href="/settings">
            add it in brand settings
          </Link>{" "}
          and Claudia will take it from there.
        </p>
      )}

      <Section query={summary} skeleton={overviewSkeleton} errorLabel="Couldn't load your visibility summary.">
        {(data) => <OverviewContent summary={data} />}
      </Section>
    </div>
  );
}
