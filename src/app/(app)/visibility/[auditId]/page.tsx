"use client";

import { Button, Card, Disclosure, ProgressBar, Skeleton, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { ArrowRightIcon, InsightIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { LoadingButton } from "@/components/ui/loading-button";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useSetupInProgress, useVisibilityReport, useVisibilitySummary, type VisibilityReport } from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";

type ReportModel = VisibilityReport["model"];
type QuickWin = ReportModel["quickWins"][number];
const SCORE_LABELS: Record<string, string> = { technical: "Technical", eeat: "Content", brand: "Authority", citability: "Citability", platform: "Answers", schema: "Schema" };
const SCORE_ORDER = ["technical", "eeat", "brand", "citability", "platform", "schema"];
const FALLBACK_PHASES = ["Foundation", "Content & Authority", "Technical & Schema", "Measure & Optimize"];
const FULL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function scoreValue(value: number | null) { return value == null ? "—" : Math.round(value).toString(); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Latest audit" : FULL_DATE_FORMATTER.format(date); }
function hostLabel(site: string) { try { return new URL(site).hostname.replace(/^www\./, ""); } catch { return site; } }
function scoreSummary(score: number | null, band: string) { if (score == null) return "Waiting for a complete score"; if (score >= 75) return "Strong Foundation"; if (score >= 60) return "Solid Foundation"; if (score >= 40) return "Needs Attention"; return band || "Critical Gaps"; }
function scoreColor(score: number | null): "success" | "warning" | "danger" | "default" { if (score == null) return "default"; if (score >= 70) return "success"; if (score >= 45) return "warning"; return "danger"; }
function severityLabel(severity: QuickWin["severity"]) { if (severity === "critical" || severity === "high") return "High"; if (severity === "medium") return "Medium"; return "Low"; }
function severityColor(severity: QuickWin["severity"]): "danger" | "warning" | "default" { return severity === "critical" || severity === "high" ? "danger" : severity === "medium" ? "warning" : "default"; }

function downloadCsv(model: ReportModel, auditId: string) {
  const rows: string[][] = [
    ["Section", "Metric", "Value"], ["Summary", "Site", model.site], ["Summary", "Overall", scoreValue(model.overall)], ["Summary", "Band", model.band],
    ...model.subScores.map((item) => ["Score", item.label, scoreValue(item.score)]),
    ...model.quickWins.map((item) => ["Quick win", item.title, item.recommendation]),
    ...model.themes.flatMap((theme) => theme.findings.map((item) => [`Week ${theme.week}: ${theme.title}`, item.title, item.recommendation])),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `visibility-report-${auditId.slice(0, 8)}.csv`; anchor.click(); URL.revokeObjectURL(url);
}

function OverviewCard({ model, delta }: { model: ReportModel; delta: number | null }) {
  const orderedScores = SCORE_ORDER.flatMap((key) => { const item = model.subScores.find((score) => score.key === key); return item ? [item] : []; });
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
      <Card>
        <Card.Header><Card.Title>Overall Score</Card.Title><Card.Description>{scoreSummary(model.overall, model.band)}</Card.Description></Card.Header>
        <Card.Content className="flex flex-1 flex-col justify-between gap-8">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-end gap-2"><strong className="text-5xl font-semibold leading-none tracking-tighter tabular-nums">{scoreValue(model.overall)}</strong><span className="pb-1 text-sm text-muted">/ 100</span></div>
            <ToneText tone={delta != null && delta < 0 ? "danger" : "success"} className="tabular-nums">{delta == null ? "First Reading" : `${delta >= 0 ? "+" : ""}${delta} points`}</ToneText>
          </div>
          <ProgressBar value={model.overall ?? 0} size="sm" aria-label="Overall visibility score"><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>
        </Card.Content>
      </Card>
      <Card>
        <Card.Header><Card.Title>Score Breakdown</Card.Title><Card.Description>{model.impact}</Card.Description></Card.Header>
        <Card.Content className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          {orderedScores.map((item) => (
            <ProgressBar key={item.key} value={item.score ?? 0} size="sm" color={scoreColor(item.score)}>
              <div className="mb-2 flex items-center justify-between text-sm"><span className="text-muted">{SCORE_LABELS[item.key] ?? item.label}</span><strong className="font-medium tabular-nums">{scoreValue(item.score)}</strong></div>
              <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
            </ProgressBar>
          ))}
        </Card.Content>
      </Card>
    </section>
  );
}

function QuickWins({ model }: { model: ReportModel }) {
  const total = Object.values(model.severityCounts).reduce((sum, count) => sum + count, 0);
  return (
    <Card>
      <Card.Header className="flex-row items-center justify-between gap-4"><div><Card.Title>Quick Wins</Card.Title><Card.Description>Highest-value issues from this audit.</Card.Description></div><Link href="/visibility/fixes" className="text-sm font-medium text-link no-underline">View All ({total})</Link></Card.Header>
      <Card.Content className="space-y-1">
        {model.quickWins.slice(0, 3).length ? model.quickWins.slice(0, 3).map((finding) => (
          <article key={`${finding.category}-${finding.title}`} className="flex flex-col gap-3 border-t border-separator py-4 first:border-t-0 sm:flex-row sm:items-start">
            <ToneText tone={severityColor(finding.severity)} className="text-xs">{severityLabel(finding.severity)}</ToneText>
            <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-foreground">{finding.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{finding.recommendation}</p></div>
            <Link href="/visibility/fixes" className="flex items-center gap-1 text-sm font-medium text-link no-underline">Fix <ArrowRightIcon className="size-4" /></Link>
          </article>
        )) : <p className="py-8 text-center text-sm text-muted">No outstanding quick wins in this audit.</p>}
      </Card.Content>
    </Card>
  );
}

function Recommendations({ model }: { model: ReportModel }) {
  return (
    <Card id="recommendations">
      <Disclosure>
        <Disclosure.Heading>
          <Button slot="trigger" variant="ghost" fullWidth className="justify-between px-0 text-base font-semibold">
            Recommendations
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="pt-5">
            <div className="grid gap-4 md:grid-cols-2">
              {model.themes.length ? model.themes.map((theme) => (
                <section key={theme.week} className="rounded-xl bg-surface-secondary p-4"><h3 className="text-sm font-semibold text-foreground">Week {theme.week}: {theme.title}</h3><div className="mt-3 space-y-3">{theme.findings.map((finding)=><p className="text-sm leading-relaxed text-muted" key={finding.title}><strong className="font-medium text-foreground">{finding.title}</strong> — {finding.recommendation}</p>)}</div></section>
              )) : <p className="text-sm text-muted">No additional recommendations were generated.</p>}
            </div>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </Card>
  );
}

function addDays(value: string, days: number) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; date.setUTCDate(date.getUTCDate() + days); return SHORT_DATE_FORMATTER.format(date); }

function FourWeekPlan({ model }: { model: ReportModel }) {
  const weeks = [0,1,2,3].map((index)=>({ number:index+1, title:model.themes[index]?.title ?? FALLBACK_PHASES[index], start:addDays(model.generatedAt,index*7), end:addDays(model.generatedAt,index*7+6) }));
  return (
    <Card><Card.Header className="flex-row items-center justify-between gap-4"><div><Card.Title>Four-Week Plan</Card.Title><Card.Description>A practical sequence for this audit.</Card.Description></div><Link href="/visibility/fixes" className="text-sm font-medium text-link no-underline">Open Fix Queue</Link></Card.Header><Card.Content className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{weeks.map((week)=><div key={week.number} className="rounded-xl bg-surface-secondary p-4"><p className="text-xs text-muted">Week {week.number}</p><p className="mt-2 text-sm font-semibold text-foreground">{week.title}</p><p className="mt-2 text-xs text-muted">{week.start}{week.start && week.end ? " – " : ""}{week.end}</p></div>)}</Card.Content></Card>
  );
}

function Appendix({ model }: { model: ReportModel }) {
  return (
    <Card>
      <Disclosure>
        <Disclosure.Heading>
          <Button slot="trigger" variant="ghost" fullWidth className="justify-between px-0 text-base font-semibold">
            Appendix
            <Disclosure.Indicator />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="pt-5">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><div><dt className="text-xs text-muted">Business Type</dt><dd className="mt-1 text-sm text-foreground">{model.businessType ?? "Not classified"}</dd></div><div><dt className="text-xs text-muted">AI Visibility</dt><dd className="mt-1 text-sm text-foreground tabular-nums">{scoreValue(model.aiVisibility)} / 100</dd></div>{model.platforms.map((platform)=><div key={platform.platform}><dt className="text-xs text-muted">{platform.platform}</dt><dd className="mt-1 text-sm text-foreground tabular-nums">{scoreValue(platform.score)} / 100</dd></div>)}</dl>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </Card>
  );
}

function ReportSkeleton() { return <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4" aria-label="Loading visibility report"><Skeleton className="h-24 rounded-2xl" /><div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-64 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div><Skeleton className="h-72 rounded-2xl" /></div>; }

function ReportCanvas({ model, auditId, previousOverall }: { model: ReportModel; auditId: string; previousOverall: number | null }) {
  const router = useProgressRouter(); const queryClient = useQueryClient(); const setupInProgress = useSetupInProgress();
  const delta = model.overall != null && previousOverall != null ? Math.round(model.overall - previousOverall) : null;
  const runAudit = useMutation({
    mutationFn: () => apiPost<{ auditId: string }>("/api/visibility/audit", {}),
    onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: queryKeys.visibilitySummary }); toast.success("Audit started."); router.push(`/visibility?audit=${result.auditId}`); },
    onError: (error) => { if (error instanceof ApiError && error.status === 402) { router.push("/account?tab=billing&upgrade=1"); return; } toast.danger(getErrorMessage(error, "Could not start the audit.")); },
  });
  return (
    <article className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4" aria-labelledby="visibility-report-title">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 id="visibility-report-title" className="type-display text-3xl text-foreground">Visibility Report</h1><p className="mt-2 text-sm text-muted"><a href={model.site} target="_blank" rel="noreferrer" className="font-medium text-link no-underline">{hostLabel(model.site)}</a> · {formatDate(model.generatedAt)} · {auditId.slice(0,8)}</p></div>
        <div className="flex flex-wrap gap-2"><a className={buttonVariants({ variant: "secondary" })} href={`/api/visibility/${auditId}/pdf`} target="_blank" rel="noreferrer">PDF</a><Button variant="secondary" onPress={() => downloadCsv(model,auditId)}>CSV</Button><LoadingButton isPending={runAudit.isPending} isDisabled={setupInProgress} onPress={()=>runAudit.mutate()}><InsightIcon className="size-4" />Run Audit · {CREDIT_COSTS.visibility_audit} cr</LoadingButton></div>
      </header>
      <OverviewCard model={model} delta={delta} />
      <QuickWins model={model} />
      <Recommendations model={model} />
      <FourWeekPlan model={model} />
      <Appendix model={model} />
    </article>
  );
}

export default function ReportPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = use(params); const report = useVisibilityReport(auditId); const summary = useVisibilitySummary();
  const previousOverall = summary.data?.latest?.id === auditId ? summary.data.previousOverall : null;
  if (report.isLoading) return <ReportSkeleton />;
  if (report.isError || !report.data) return <Card className="mx-auto mt-16 max-w-xl text-center"><Card.Header><Card.Title>Couldn’t Load This Report</Card.Title><Card.Description>The audit may still be running, or the report is no longer available.</Card.Description></Card.Header><Card.Footer className="justify-center"><Link href="/visibility" className={buttonVariants({ variant: "primary" })}>Back to Visibility</Link></Card.Footer></Card>;
  return <ReportCanvas model={report.data.model} auditId={auditId} previousOverall={previousOverall} />;
}
