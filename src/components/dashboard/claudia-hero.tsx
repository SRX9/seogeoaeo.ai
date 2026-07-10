"use client";

import { Button, Chip } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ClaudiaAvatar } from "@/components/dashboard/claudia-avatar";
import { SteerClaudia } from "@/components/dashboard/steer-claudia";
import { CheckIcon, MinusIcon, XIcon } from "@/components/icons";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { apiPost } from "@/lib/api/fetcher";
import {
  queryKeys,
  useAgentState,
  useMe,
  useSetupRun,
  type SetupStep,
} from "@/lib/api/queries";
import { isActiveSubscription } from "@/lib/billing/plans";
import { cn } from "@/lib/cn";

function SetupStepIcon({ status }: { status: SetupStep["status"] }) {
  if (status === "done") return <CheckIcon className="size-3.5 text-success" />;
  if (status === "skipped") return <MinusIcon className="size-3.5 text-muted" />;
  if (status === "failed") return <XIcon className="size-3.5 text-danger" />;
  if (status === "running") {
    return <span className="size-2 rounded-full bg-accent" aria-label="Running" />;
  }
  return <span className="size-2 rounded-full border border-border" aria-hidden />;
}

function HeroShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-surface p-6 shadow-surface sm:p-9">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">{children}</div>
    </section>
  );
}

function StateChip({ id, label }: { id: string; label: string }) {
  const color =
    id === "needs_attention"
      ? "danger"
      : id === "waiting_for_you"
        ? "warning"
        : id === "working_now" || id === "on_duty"
          ? "success"
          : "default";
  return (
    <Chip size="sm" color={color} variant="soft">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}

export function ClaudiaHero() {
  const queryClient = useQueryClient();
  const me = useMe();
  const setup = useSetupRun();
  const agent = useAgentState();
  const start = useMutation({
    mutationFn: () => apiPost("/api/setup-run", {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.setupRun });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
    },
  });

  if (me.isLoading || setup.isLoading || agent.isLoading) {
    return <CardSkeleton lines={5} className="rounded-[1.75rem]" />;
  }

  const run = setup.data?.run ?? null;
  const labels = setup.data?.labels ?? {};
  const state = agent.data;
  const subscribed = isActiveSubscription(me.data?.subscription?.status);

  if (!run) {
    return (
      <HeroShell>
        <ClaudiaAvatar working={start.isPending} />
        <div className="min-w-0 flex-1">
          <Chip size="sm" variant="soft">Ready to begin</Chip>
          <h1 className="mt-4 max-w-2xl text-2xl text-foreground sm:text-3xl">
            Build the evidence Claudia needs to run the brand
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            She will audit the site, map buyer questions, establish competitor context, research
            the first opportunities, and prepare the first week of work.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {subscribed ? (
              <Button isPending={start.isPending} onPress={() => start.mutate()}>
                {start.isPending ? "Starting…" : "Put Claudia to work"}
              </Button>
            ) : (
              <Link href="/account?tab=billing">
                <Button>Choose a plan</Button>
              </Link>
            )}
          </div>
        </div>
      </HeroShell>
    );
  }

  if (run.status !== "completed") {
    const failed = run.status === "failed";
    const current = run.steps.find((step) => step.status === "running");
    const done = run.steps.filter(
      (step) => step.status === "done" || step.status === "skipped",
    ).length;
    return (
      <HeroShell>
        <ClaudiaAvatar working={!failed} />
        <div className="min-w-0 flex-1">
          <StateChip
            id={failed ? "needs_attention" : "working_now"}
            label={failed ? "Needs attention" : "Working now"}
          />
          <h1 className="mt-4 text-2xl text-foreground sm:text-3xl">
            {failed
              ? "Setup stopped before the operating baseline was ready"
              : current
                ? labels[current.key] ?? "Building the brand operating baseline"
                : "Building the brand operating baseline"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
            {failed
              ? "Resume from the first unfinished step. Completed evidence will not be repeated."
              : "This is real setup work. You can leave and the durable workflow will continue."}
          </p>
          <div className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2" aria-live="polite">
            {run.steps.map((step) => (
              <div key={step.key} className="flex min-h-8 items-start gap-2 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                  <SetupStepIcon status={step.status} />
                </span>
                <span
                  className={cn(
                    step.status === "pending" ? "text-muted" : "text-foreground",
                    step.status === "failed" && "text-danger",
                  )}
                >
                  {labels[step.key] ?? step.key}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted tabular-nums">
              {done} of {run.steps.length} steps complete
            </span>
            {failed ? (
              <Button
                size="sm"
                variant="secondary"
                isPending={start.isPending}
                onPress={() => start.mutate()}
              >
                Resume setup
              </Button>
            ) : null}
          </div>
        </div>
      </HeroShell>
    );
  }

  if (!state) return <CardSkeleton lines={5} className="rounded-[1.75rem]" />;
  const headline = state.now
    ? state.now.title
    : state.waiting
      ? state.waiting.title
      : state.next[0]
        ? `Next: ${state.next[0].title}`
        : state.mission.objective;
  const context = state.now?.reason ?? state.waiting?.blockedValue ?? state.plan.rationale;

  return (
    <HeroShell>
      <ClaudiaAvatar working={state.presence.isWorking} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StateChip id={state.presence.id} label={state.presence.label} />
          <span className="text-xs text-muted tabular-nums">Plan v{state.plan.version}</span>
        </div>
        <p className="mt-4 text-sm font-medium text-muted">{state.mission.objective}</p>
        <h1 className="mt-2 max-w-3xl text-2xl text-foreground sm:text-3xl">{headline}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{context}</p>
        {state.next[0]?.scheduledFor && !state.now ? (
          <p className="mt-3 text-sm text-muted">
            Scheduled for{" "}
            <time dateTime={state.next[0].scheduledFor} suppressHydrationWarning>
              {new Date(state.next[0].scheduledFor).toLocaleString([], {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <SteerClaudia />
          {state.waiting ? (
            <Link href={state.waiting.href}>
              <Button variant="ghost">{state.waiting.actionLabel}</Button>
            </Link>
          ) : null}
        </div>
      </div>
    </HeroShell>
  );
}
