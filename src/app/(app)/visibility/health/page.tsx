"use client";

import { Button, Card } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState } from "@heroui-pro/react/empty-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CircleCheckIcon } from "@/components/icons";
import { Section } from "@/components/feedback/section";
import { TableSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useBrandProfile, useSiteHealth, type SiteHealthResponse } from "@/lib/api/queries";
import { HEALTH_GROUP_LABELS } from "@/lib/visibility/display";
import { buildFixPrompt } from "@/lib/visibility/fix-prompt";
import type {
  HealthCheck,
  HealthGroup,
  SiteHealthSnapshot,
} from "@/lib/visibility/site-health";

/**
 * V9 — Site Health: every check the site should pass to look its best in
 * Google and AI assistants, grouped by area. Passing rows confirm what's done;
 * failing rows open into a copy-paste prompt for the owner's AI coding
 * assistant, and also live in the fix queue.
 */

const GROUP_ORDER: HealthGroup[] = [
  "performance",
  "search_listing",
  "social_preview",
  "crawler_access",
  "structured_data",
  "ai_readiness",
  "security",
];

const STATUS_DOT: Record<HealthCheck["status"], string> = {
  pass: "bg-success",
  warn: "bg-warning",
  fail: "bg-danger",
};

function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="primary"
      onPress={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied ✓" : "Copy prompt"}
    </Button>
  );
}

function CheckRow({ check, website }: { check: HealthCheck; website: string | null }) {
  const [open, setOpen] = useState(false);
  const finding = check.finding;
  const expandable = check.status !== "pass" && finding != null;

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex items-start gap-3 py-3">
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_DOT[check.status]}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{check.label}</p>
          <p className="truncate text-sm text-default-500">{check.detail}</p>
        </div>
        {expandable && (
          <Button size="sm" variant="outline" onPress={() => setOpen(!open)}>
            {open ? "Hide fix" : "Show fix"}
          </Button>
        )}
      </div>
      {open && finding && (
        <div className="mb-3 ml-5 space-y-2 rounded-lg border border-border bg-surface-muted p-3">
          <p className="text-sm text-default-600">{finding.recommendation}</p>
          <div className="flex flex-wrap items-center gap-2">
            <CopyPromptButton
              text={buildFixPrompt(
                {
                  pillar: finding.pillar,
                  category: finding.category,
                  severity: finding.severity,
                  title: finding.title,
                  recommendation: finding.recommendation,
                  fixPayload: finding.fix_payload,
                },
                website,
              )}
            />
            <Link
              href="/visibility/fixes"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              Open fix queue
            </Link>
          </div>
          <p className="text-xs text-default-400">
            Paste the prompt into Cursor, Claude Code, or Copilot inside your website&apos;s
            project — it includes everything the assistant needs.
          </p>
        </div>
      )}
    </div>
  );
}

const SOURCE_LABEL: Record<SiteHealthSnapshot["source"], string> = {
  audit: "from your last audit",
  refresh: "manual refresh",
  agent: "Claudia's weekly check",
};

function SummaryHeader({
  snapshot,
  refreshCooldownUntil,
  refreshesLeft,
}: {
  snapshot: SiteHealthSnapshot;
  refreshCooldownUntil: string | null;
  refreshesLeft: number;
}) {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => apiPost<{ snapshot: SiteHealthSnapshot }>("/api/visibility/site-health"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.siteHealth });
      queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings });
      queryClient.invalidateQueries({ queryKey: queryKeys.credits });
    },
  });
  const coolingDown = Boolean(
    refreshCooldownUntil && new Date(refreshCooldownUntil).getTime() > Date.now(),
  );
  const outOfRefreshes = refreshesLeft <= 0;

  const stats: Array<{ value: string; label: string }> = [
    { value: String(snapshot.summary.pass), label: "passing" },
    { value: String(snapshot.summary.warn), label: "to improve" },
    { value: String(snapshot.summary.fail), label: "failing" },
  ];
  if (snapshot.psiAvailable && snapshot.scores?.performance != null) {
    stats.push({ value: `${snapshot.scores.performance}/100`, label: "Lighthouse speed" });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-default-100 px-3 py-2">
              <p className="text-lg font-semibold leading-tight">{s.value}</p>
              <p className="text-xs text-default-500">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="shrink-0 space-y-1 sm:text-right">
          <Button
            size="sm"
            variant="secondary"
            isDisabled={refresh.isPending || coolingDown || outOfRefreshes}
            onPress={() => refresh.mutate()}
          >
            {refresh.isPending ? "Checking your site… (up to a minute)" : "Refresh checks · 5 credits"}
          </Button>
          <p className="text-xs text-default-400">
            {coolingDown
              ? "Recently checked — refresh again in a few minutes"
              : outOfRefreshes
                ? "Weekly recheck limit reached — Claudia re-checks your site automatically every week"
                : `Checked ${new Date(snapshot.generatedAt).toLocaleString()} · ${SOURCE_LABEL[snapshot.source]}${
                    refreshesLeft <= 3
                      ? ` · ${refreshesLeft} recheck${refreshesLeft === 1 ? "" : "s"} left this week`
                      : ""
                  }`}
          </p>
        </div>
      </div>
      {refresh.isError && (
        <p className="mt-2 text-sm text-danger">
          {getErrorMessage(refresh.error, "Couldn't refresh the checks — try again.")}
        </p>
      )}
      {!snapshot.psiAvailable && (
        <p className="mt-3 text-xs text-default-400">
          Speed checks are a static estimate — real PageSpeed data isn&apos;t configured yet.
        </p>
      )}
    </Card>
  );
}

function Checklist({ data, website }: { data: SiteHealthResponse; website: string | null }) {
  const snapshot = data.snapshot;
  if (!data.hasData || !snapshot) {
    return (
      <EmptyState className="rounded-xl border border-dashed border-border">
        <EmptyState.Header>
          <EmptyState.Media variant="icon">
            <CircleCheckIcon />
          </EmptyState.Media>
          <EmptyState.Title>No health checks yet</EmptyState.Title>
          <EmptyState.Description>
            Run a visibility audit and Claudia checks everything on this list — speed, search
            listing, social previews, crawler access, and more.
          </EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.Content>
          <Link href="/visibility" className={buttonVariants({ size: "sm", variant: "secondary" })}>
            Open visibility
          </Link>
        </EmptyState.Content>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <SummaryHeader
        snapshot={snapshot}
        refreshCooldownUntil={data.refreshCooldownUntil}
        refreshesLeft={data.refreshesLeft}
      />
      {GROUP_ORDER.map((group) => {
        const checks = snapshot.checks.filter((c) => c.group === group);
        if (checks.length === 0) return null;
        const failing = checks.filter((c) => c.status !== "pass").length;
        return (
          <Card key={group} className="p-4">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{HEALTH_GROUP_LABELS[group]}</h2>
              <p className="text-xs text-default-400">
                {failing === 0 ? "All good" : `${failing} to fix`}
              </p>
            </div>
            <div>
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} website={website} />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function SiteHealthPage() {
  const health = useSiteHealth();
  const website = useBrandProfile().data?.profile.website?.trim() || null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Site health"
        description="Every check your site should pass to look its best in Google and AI assistants. Green means done; anything else opens into the exact fix — copy the prompt and hand it to your AI coding assistant."
      />
      <Section
        query={health}
        skeleton={<TableSkeleton rows={8} />}
        errorLabel="Couldn't load your site health checks."
      >
        {(data) => <Checklist data={data} website={website} />}
      </Section>
    </div>
  );
}
