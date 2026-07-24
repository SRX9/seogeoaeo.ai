"use client";

import { Button, ProgressBar, buttonVariants } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ClaudiaOrb } from "@/components/claudia/claudia-orb";
import { CheckIcon } from "@/components/icons";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { apiPost } from "@/lib/api/fetcher";
import {
  queryKeys,
  useMe,
  useSetupRun,
  type SetupRunResponse,
  type SetupStep,
} from "@/lib/api/queries";
import { isActiveSubscription } from "@/lib/billing/plans";
import { cn } from "@/lib/cn";

/**
 * Owner-facing fallbacks for step labels. The server's `labels` map is the
 * source of truth (deliberately vague — see SETUP_STEPS); this only covers a
 * label the API hasn't learned yet after a step-list evolution.
 */
const FALLBACK_LABELS: Record<string, string> = {
  first_audit: "Getting to know your site",
  seed_prompts: "Learning how your buyers ask",
  answer_check: "Checking your AI presence",
  competitor_baseline: "Sizing up the landscape",
  topic_research: "Picking the first opportunities",
  quick_win_fixes: "Lining up quick wins",
  first_article: "Creating your first piece",
  day0_brief: "Writing up her notes",
};

function stepSettled(step: SetupStep) {
  return step.status === "done" || step.status === "skipped";
}

function StepRow({ step, label, active }: { step: SetupStep; label: string; active: boolean }) {
  const settled = stepSettled(step);
  const failed = step.status === "failed";
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center",
          settled ? "text-success" : active ? "text-accent" : failed ? "text-danger" : "text-muted",
        )}
        aria-hidden
      >
        {settled ? (
          <CheckIcon className="size-4" />
        ) : active ? (
          <span className="relative grid size-4 place-items-center">
            <span className="absolute size-2.5 animate-ping rounded-full bg-accent/40 motion-reduce:animate-none" />
            <span className="size-1.5 rounded-full bg-accent" />
          </span>
        ) : (
          <span className={cn("size-1.5 rounded-full", failed ? "bg-danger" : "bg-border")} />
        )}
      </span>
      <span
        className={cn(
          "text-sm",
          settled ? "text-muted" : active ? "font-medium text-foreground" : "text-muted",
          failed && !active && "text-danger",
        )}
      >
        {label}
      </span>
    </li>
  );
}

function SetupWorkspace({
  setup,
  subscribed,
  isPending,
  onStart,
}: {
  setup: SetupRunResponse;
  subscribed: boolean;
  isPending: boolean;
  onStart: () => void;
}) {
  const run = setup.run;
  const steps = run?.steps ?? [];
  const recoveryState = run?.recovery?.state ?? null;
  const recovering = recoveryState === "scheduled" || recoveryState === "retrying";
  const needsHelp = recoveryState === "needs_help";
  const stopped = run?.status === "blocked" || needsHelp;
  const working = Boolean(run) && (run?.status === "running" || recovering || isPending);
  const settledCount = steps.filter(stepSettled).length;
  const activeKey = recovering
    ? steps.find((step) => step.status === "failed")?.key
    : steps.find((step) => !stepSettled(step) && step.status !== "failed")?.key;
  const progress = run
    ? Math.max(6, Math.round((settledCount / Math.max(steps.length, 1)) * 100))
    : 0;
  const label = (step: SetupStep) =>
    setup.labels?.[step.key] ?? FALLBACK_LABELS[step.key] ?? "Working on your setup";

  return (
    <section
      className="relative grid min-h-[calc(100dvh-7rem)] items-center gap-8 overflow-hidden px-5 py-10 md:grid-cols-[minmax(19rem,0.9fr)_minmax(24rem,1.1fr)] md:px-10 lg:gap-16 lg:px-16"
      aria-labelledby="setup-title"
    >
      <span
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_35%_50%,oklch(86%_0.07_239/0.38),transparent_38%)]"
        aria-hidden
      />
      <div className="grid place-items-center">
        <ClaudiaOrb working={working} />
      </div>
      <div className="flex max-w-2xl flex-col justify-center">
            <p
              className={cn(
                "text-sm font-medium",
                stopped ? "text-danger" : run ? "text-accent" : "text-muted",
              )}
            >
              {stopped
                ? "Setup needs a hand"
                : recoveryState === "scheduled"
                  ? "Claudia will try again shortly"
                  : recoveryState === "retrying"
                    ? "Claudia is trying again"
                    : run
                      ? "Claudia is getting ready"
                      : "Ready to start"}
            </p>
            <h1
              id="setup-title"
              className="type-display mt-3 text-balance text-3xl text-foreground sm:text-4xl"
            >
              {stopped
                ? "Claudia needs a hand—your work is safe"
                : recovering
                  ? "Claudia hit a snag and is taking another pass"
                  : run
                    ? "Setting up your first week"
                    : "Let Claudia prepare your first week"}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted text-pretty">
              {stopped
                ? "Everything finished so far is saved. Claudia has asked the team for help, and you can start another attempt whenever you’re ready."
                : recovering && run
                  ? `Everything finished so far is saved. She’ll retry the unfinished work up to ${run.recovery?.maxAttempts ?? 3} times before asking the team for help.`
                  : run
                    ? "She’s learning your brand and preparing her first actions. Each step checks off as she finishes it."
                    : "She will learn the brand, find the strongest opportunities, and prepare useful first actions."}
            </p>

            {run ? (
              <ol className="mt-6 grid gap-x-8 sm:grid-cols-2" aria-label="Setup steps">
                {steps.map((step) => (
                  <StepRow
                    key={step.key}
                    step={step}
                    label={label(step)}
                    active={working && step.key === activeKey}
                  />
                ))}
              </ol>
            ) : null}

            {run && !stopped ? (
              <div className="mt-6 space-y-3">
                <ProgressBar value={progress} aria-label="Claudia setup progress">
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
                <p className="text-sm text-muted">
                  {settledCount} of {steps.length} steps done ·{" "}
                  {recoveryState === "scheduled"
                    ? "She’ll try the unfinished work again shortly."
                    : recoveryState === "retrying"
                      ? "She’s retrying the unfinished work now."
                      : "You can leave—Claudia will continue."}
                </p>
              </div>
            ) : null}

            {!run || stopped ? (
              <div className="mt-7">
                {subscribed ? (
                  <Button
                    className="min-h-11 transition-transform active:scale-[0.96]"
                    isPending={isPending}
                    onPress={onStart}
                  >
                    {isPending
                      ? "Starting another attempt…"
                      : stopped
                        ? "Give it another try"
                        : "Start Claudia"}
                  </Button>
                ) : (
                  <Link
                    href="/account?tab=billing"
                    className={cn(buttonVariants(), "min-h-11 transition-transform active:scale-[0.96]")}
                  >
                    Choose work capacity
                  </Link>
                )}
              </div>
            ) : null}
      </div>
    </section>
  );
}

export function ClaudiaHero({ setup }: { setup: SetupRunResponse }) {
  const queryClient = useQueryClient();
  const me = useMe();
  // Live view: useSetupRun polls every 10s while the run is `running`, so the
  // steps check off (and failures surface) without waiting for a full
  // dashboard refetch.
  const live = useSetupRun();
  const start = useMutation({
    mutationFn: () => apiPost("/api/setup-run", {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.setupRun });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
    },
  });

  if (me.isLoading) return <CardSkeleton lines={4} className="min-h-96" />;

  return (
    <SetupWorkspace
      setup={live.data ?? setup}
      isPending={start.isPending}
      subscribed={isActiveSubscription(me.data?.subscription?.status)}
      onStart={() => start.mutate()}
    />
  );
}
