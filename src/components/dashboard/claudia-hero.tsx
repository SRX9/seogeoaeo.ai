"use client";

import { Button } from "@heroui/react/button";
import { TextShimmer } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ClaudiaAvatar } from "@/components/dashboard/claudia-avatar";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { apiPost } from "@/lib/api/fetcher";
import {
  queryKeys,
  useAutomation,
  useMe,
  useSetupRun,
  type AutomationStats,
  type SetupStep,
} from "@/lib/api/queries";
import { isActiveSubscription } from "@/lib/billing/plans";
import { cn } from "@/lib/cn";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "in 6 hours" / "3 days ago" relative to now, matching the agent card. */
function relativeLabel(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const days = Math.round(abs / DAY_MS);
  const hours = Math.round(abs / (60 * 60 * 1000));
  const value =
    days >= 1
      ? `${days} day${days === 1 ? "" : "s"}`
      : `${Math.max(hours, 1)} hour${Math.max(hours, 1) === 1 ? "" : "s"}`;
  return past ? `${value} ago` : `in ${value}`;
}

function firstName(name: string | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** Her first-person status once setup is done, from durable agent stats. */
function derivedBrief(a: AutomationStats): string {
  if (!a.enabled) {
    return "I'm paused right now — resubscribe and I'll get back to researching and writing for your brand every day.";
  }
  const parts: string[] = [];
  parts.push(
    a.articlesWritten > 0
      ? `I've written ${a.articlesWritten} article${a.articlesWritten === 1 ? "" : "s"} for you so far`
      : "I'm lining up your first articles",
  );
  if (a.pendingTopics > 0) {
    parts.push(
      `${a.pendingTopics} topic${a.pendingTopics === 1 ? "" : "s"} queued to write next`,
    );
  }
  return `${parts.join(", ")}.`;
}

function StepIcon({ status }: { status: SetupStep["status"] }) {
  if (status === "done") return <span className="text-success">✓</span>;
  if (status === "skipped") return <span className="text-default-400">–</span>;
  if (status === "failed") return <span className="text-danger">✕</span>;
  if (status === "running")
    return (
      <span
        className="inline-block size-2 animate-pulse rounded-full bg-accent"
        aria-label="running"
      />
    );
  return <span className="text-default-300">○</span>;
}

function HeroShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">{children}</div>
    </section>
  );
}

/**
 * The Overview hero — Claudia at her desk. On a brand-new brand this is her live
 * Setup Run (steps checking off, current one shimmering) so the first thing an
 * owner sees is her working, not an empty dashboard. Once she's set up it becomes
 * her first-person brief plus the next-run schedule. Also owns Ignition when a
 * subscribed brand has no run yet.
 */
export function ClaudiaHero() {
  const queryClient = useQueryClient();
  const me = useMe();
  const setup = useSetupRun();
  const automation = useAutomation();

  const start = useMutation({
    mutationFn: () => apiPost("/api/setup-run", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.setupRun }),
  });

  // Wait for all three so the hero swaps in as one piece (no header flash).
  if (me.isLoading || setup.isLoading || automation.isLoading) {
    return <CardSkeleton lines={4} className="rounded-2xl" />;
  }

  const subscribed = isActiveSubscription(me.data?.subscription?.status);
  const name = firstName(me.data?.user.name);
  const run = setup.data?.run ?? null;
  const labels = setup.data?.labels ?? {};
  const stats = automation.data;

  // ── Live setup: her steps, checking off. The Day-0 "first time" moment. ──
  if (run && run.status !== "completed") {
    const failed = run.status === "failed";
    const runningStep = run.steps.find((s) => s.status === "running");
    const doneCount = run.steps.filter(
      (s) => s.status === "done" || s.status === "skipped",
    ).length;
    return (
      <HeroShell>
        <ClaudiaAvatar working={!failed} />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-foreground">
                {failed ? "Claudia paused mid-setup" : "Claudia is setting up your brand"}
              </h2>
              <div className="mt-1 text-sm text-muted">
                {failed ? (
                  "She hit a snag. Pick up where she left off."
                ) : runningStep ? (
                  <TextShimmer className="text-muted">
                    {labels[runningStep.key] ?? "Working…"}
                  </TextShimmer>
                ) : (
                  "You can leave — she'll finish without you and post her Day-0 brief here."
                )}
              </div>
            </div>
            {failed ? (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={start.isPending}
                onPress={() => start.mutate()}
              >
                {start.isPending ? "Resuming…" : "Resume setup"}
              </Button>
            ) : (
              <span className="shrink-0 text-sm text-muted tabular-nums">
                {doneCount}/{run.steps.length} done
              </span>
            )}
          </div>

          <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {run.steps.map((step) => (
              <li key={step.key} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 w-4 shrink-0 text-center">
                  <StepIcon status={step.status} />
                </span>
                <span
                  className={cn(
                    step.status === "pending"
                      ? "text-default-400"
                      : step.status === "failed"
                        ? "text-danger"
                        : "text-foreground",
                  )}
                >
                  {step.status === "running" ? (
                    <TextShimmer>{labels[step.key] ?? step.key}</TextShimmer>
                  ) : (
                    (labels[step.key] ?? step.key)
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </HeroShell>
    );
  }

  // ── No run yet: Ignition (subscribed) or a plan nudge (not subscribed). ──
  if (!run) {
    return (
      <HeroShell>
        <ClaudiaAvatar working={start.isPending} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {subscribed
                ? `${name ? `${name}, ` : ""}Claudia is ready to set herself up`
                : "Claudia is ready when you are"}
            </h2>
            <p className="mt-1 max-w-prose text-sm text-muted">
              First audit, the questions buyers ask AI, a competitor baseline, topic research,
              and your first article — all included, no steps for you.
            </p>
          </div>
          {subscribed ? (
            <Button isDisabled={start.isPending} onPress={() => start.mutate()}>
              {start.isPending ? "Starting…" : "Put Claudia to work"}
            </Button>
          ) : (
            <Link href="/account?tab=billing" className="inline-block">
              <Button>Choose a plan</Button>
            </Link>
          )}
        </div>
      </HeroShell>
    );
  }

  // ── Settled: her brief + next run. ──
  const working =
    !!stats &&
    stats.enabled &&
    stats.agentState !== "paused_no_subscription" &&
    stats.agentState !== "paused_no_credits";
  const brief = run.briefText?.trim() || (stats ? derivedBrief(stats) : "");
  const briefLabel = run.briefText?.trim() ? "Claudia's Day-0 brief" : "On the job";

  return (
    <HeroShell>
      <ClaudiaAvatar working={working} />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{briefLabel}</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {name ? `Hi ${name} — ` : ""}here&apos;s where things stand
          </h2>
        </div>
        {brief ? <p className="max-w-prose text-sm text-foreground">{brief}</p> : null}
        {stats?.nextRunAt ? (
          <p className="text-sm text-muted">
            Next run{" "}
            <span className="font-medium text-foreground">
              {relativeLabel(stats.nextRunAt)}
            </span>{" "}
            · {stats.schedule}
          </p>
        ) : null}
      </div>
    </HeroShell>
  );
}
