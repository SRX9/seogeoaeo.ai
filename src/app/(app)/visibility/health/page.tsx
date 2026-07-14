"use client";

import { Button, Card, Disclosure, Skeleton } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CheckIcon, CircleCheckIcon, RefreshIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { Section } from "@/components/feedback/section";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useBrandProfile, useSiteHealth, type SiteHealthResponse } from "@/lib/api/queries";
import { buildFixPrompt } from "@/lib/visibility/fix-prompt";
import type { HealthCheck, HealthStatus, SiteHealthSnapshot } from "@/lib/visibility/site-health";

const STATUS_ORDER: HealthStatus[] = ["fail", "warn", "pass"];
const STATUS_COPY: Record<HealthStatus, { title: string; summaryLabel: string }> = {
  fail: { title: "Falling Behind", summaryLabel: "Failing" },
  warn: { title: "Needs Improvement", summaryLabel: "Improve" },
  pass: { title: "All Good", summaryLabel: "Passing" },
};

function colorFor(status: HealthStatus): "danger" | "warning" | "success" {
  return status === "fail" ? "danger" : status === "warn" ? "warning" : "success";
}

function statusMarkClass(status: HealthStatus) {
  if (status === "fail") return "bg-danger-soft text-danger-soft-foreground";
  if (status === "warn") return "bg-warning-soft text-warning-soft-foreground";
  return "bg-success-soft text-success-soft-foreground";
}

function impactLabel(check: HealthCheck) {
  const severity = check.finding?.severity;
  if (severity === "critical" || severity === "high") return "High Impact";
  if (severity === "medium") return "Medium Impact";
  return "Low Impact";
}

function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return <Button size="sm" variant="secondary" onPress={() => void copyPrompt()}>{copied ? "Copied" : "Copy Prompt"}</Button>;
}

function CheckRow({ check, website, initiallyOpen = false }: { check: HealthCheck; website: string | null; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const finding = check.finding;
  const expandable = check.status !== "pass" && finding != null;
  const title = finding?.title ?? check.label;

  const summary = (
    <>
        <span className={`mt-1 flex size-5 shrink-0 items-center justify-center rounded-full ${statusMarkClass(check.status)}`} aria-hidden>
          {check.status === "pass" ? <CheckIcon className="size-3" /> : <span className="text-xs font-semibold">{check.status === "warn" ? "–" : "!"}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-medium text-foreground">{title}</strong>
          <span className="mt-1 block text-sm leading-relaxed text-muted">{check.detail}</span>
        </span>
        {check.status !== "pass" ? <ToneText tone={colorFor(check.status)} className="text-xs">{impactLabel(check)}</ToneText> : null}
    </>
  );

  if (!expandable || !finding) {
    return <article className="flex items-start gap-3 border-t border-separator px-1 py-4 first:border-t-0">{summary}</article>;
  }

  return (
    <article className="border-t border-separator first:border-t-0">
      <Disclosure isExpanded={open} onExpandedChange={setOpen}>
        <Disclosure.Heading>
          <Button slot="trigger" variant="ghost" fullWidth className="h-auto justify-start gap-3 px-1 py-4 text-left">
            {summary}
            <Disclosure.Indicator className="mt-1 shrink-0" />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="mb-4 ml-8 rounded-xl bg-surface-secondary p-4">
            <p className="text-sm leading-relaxed text-foreground">{finding.recommendation}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyPromptButton text={buildFixPrompt({ pillar: finding.pillar, category: finding.category, severity: finding.severity, title: finding.title, recommendation: finding.recommendation, fixPayload: finding.fix_payload }, website)} />
              <Link href="/visibility/fixes" className={buttonVariants({ size: "sm", variant: "primary" })}>Open Fix Queue</Link>
            </div>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </article>
  );
}

function StatusSection({ status, checks, website }: { status: HealthStatus; checks: HealthCheck[]; website: string | null }) {
  const [open, setOpen] = useState(status !== "pass");
  return (
    <Card>
      <Disclosure isExpanded={open} onExpandedChange={setOpen}>
        <Disclosure.Heading>
          <Button slot="trigger" variant="ghost" fullWidth className="justify-start px-1 text-left">
            <span className="text-base font-semibold text-foreground">{STATUS_COPY[status].title}</span>
            <ToneText tone={colorFor(status)} className="tabular-nums">{checks.length}</ToneText>
            <Disclosure.Indicator className="ml-auto" />
          </Button>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="mt-3">
            {checks.length ? checks.map((check, index) => <CheckRow key={check.id} check={check} website={website} initiallyOpen={status === "fail" && index === 0} />) : <p className="py-4 text-sm text-muted">No checks in this group.</p>}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </Card>
  );
}

function SummaryStrip({ snapshot }: { snapshot: SiteHealthSnapshot }) {
  const speed = snapshot.scores?.performance;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Site health summary">
      {(["pass", "warn", "fail"] as const).map((status) => (
        <Card key={status} variant="secondary">
          <Card.Content>
            <p className="text-xs text-muted">{STATUS_COPY[status].summaryLabel}</p>
            <p className="mt-2 text-3xl font-semibold leading-none text-foreground tabular-nums">{snapshot.summary[status]}</p>
          </Card.Content>
        </Card>
      ))}
      <Card variant="secondary"><Card.Content><p className="text-xs text-muted">Speed</p><p className="mt-2 text-3xl font-semibold leading-none text-foreground tabular-nums">{speed ?? "—"}</p></Card.Content></Card>
    </section>
  );
}

function RefreshButton({ data }: { data: SiteHealthResponse }) {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => apiPost<{ snapshot: SiteHealthSnapshot }>("/api/visibility/site-health"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.siteHealth });
      queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
    },
  });
  const coolingDown = Boolean(data.refreshCooldownUntil);
  const outOfRefreshes = data.refreshesLeft <= 0;
  const disabledReason = coolingDown ? "Recently checked. Try again in a few minutes." : outOfRefreshes ? "This week's manual rechecks are used." : undefined;
  return (
    <div>
      <Button isPending={refresh.isPending} isDisabled={coolingDown || outOfRefreshes} onPress={() => refresh.mutate()}>
        <RefreshIcon className="size-4" aria-hidden />Refresh · 5 cr
      </Button>
      {disabledReason ? <p className="mt-2 max-w-xs text-pretty text-xs text-muted">{disabledReason}</p> : null}
      {refresh.isError ? <p className="mt-2 text-sm text-danger" role="alert">{getErrorMessage(refresh.error, "Couldn't refresh the checks.")}</p> : null}
    </div>
  );
}

function HealthCanvas({ data, website }: { data: SiteHealthResponse; website: string | null }) {
  const snapshot = data.snapshot;
  if (!data.hasData || !snapshot) {
    return (
      <Card className="mx-auto mt-16 max-w-xl">
        <EmptyState className="py-10">
          <EmptyState.Header>
            <EmptyState.Media variant="icon"><CircleCheckIcon className="text-muted" aria-hidden /></EmptyState.Media>
            <EmptyState.Title>No Health Checks Yet</EmptyState.Title>
            <EmptyState.Description>Run a visibility audit to check speed, search listings, crawler access, and structured data.</EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content><Link href="/visibility" className={buttonVariants({ variant: "primary" })}>Open Visibility</Link></EmptyState.Content>
        </EmptyState>
      </Card>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="sr-only">Site Health</h1><p className="text-sm text-muted">Technical checks that affect search and AI discovery.</p></div>
        <RefreshButton data={data} />
      </header>
      <SummaryStrip snapshot={snapshot} />
      {!snapshot.psiAvailable ? <p className="rounded-xl bg-surface-secondary px-4 py-3 text-sm text-muted">Speed will appear after PageSpeed data is available.</p> : null}
      <div className="space-y-4">{STATUS_ORDER.map((status) => <StatusSection key={status} status={status} checks={snapshot.checks.filter((check) => check.status === status)} website={website} />)}</div>
    </main>
  );
}

function SiteHealthSkeleton() {
  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4" aria-label="Loading site health"><Skeleton className="h-20 rounded-2xl" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0,1,2,3].map((i)=><Skeleton key={i} className="h-28 rounded-2xl" />)}</div>{[0,1,2].map((i)=><Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;
}

export default function SiteHealthPage() {
  const health = useSiteHealth();
  const website = useBrandProfile().data?.profile.website?.trim() || null;
  return <Section query={health} skeleton={<SiteHealthSkeleton />} errorLabel="Couldn't load your site health checks.">{(data) => <HealthCanvas data={data} website={website} />}</Section>;
}
