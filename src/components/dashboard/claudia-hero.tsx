"use client";

import { Button, Card, ProgressBar, buttonVariants } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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

/**
 * Claudia's portrait: her animation while she is actively working, the still
 * logo when she is resting (not started, settled, or stopped by a failure).
 */
function ClaudiaPortrait({ working }: { working: boolean }) {
  return (
    <div className="grid min-h-40 place-items-center bg-surface-secondary p-6 md:min-h-[28rem]">
      {working ? (
        <video
          src="/claudua_animated.mp4"
          autoPlay
          loop
          muted
          playsInline
          aria-hidden
          className="size-28 rounded-2xl object-cover md:size-32"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- small static asset, no next/image sizing needed
        <img
          src="/claudia-bg-free-logo.png"
          alt=""
          aria-hidden
          className="size-28 rounded-2xl object-contain md:size-32"
        />
      )}
    </div>
  );
}

function StepRow({ step, label, active }: { step: SetupStep; label: string; active: boolean }) {
  const settled = stepSettled(step);
  const failed = step.status === "failed";
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center",
          settled ? "text-success" : failed ? "text-danger" : "text-muted",
        )}
        aria-hidden
      >
        {settled ? (
          <CheckIcon className="size-4" />
        ) : active ? (
          <span className="relative grid size-4 place-items-center">
            <span className="absolute size-2.5 animate-ping rounded-lg bg-accent/40" />
            <span className="size-1.5 rounded-lg bg-accent" />
          </span>
        ) : (
          <span className={cn("size-1.5 rounded-lg", failed ? "bg-danger" : "bg-border")} />
        )}
      </span>
      <span
        className={cn(
          "text-sm",
          settled ? "text-muted" : active ? "font-medium text-foreground" : "text-muted",
          failed && "text-danger",
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
  const stopped = run?.status === "failed" || run?.status === "blocked";
  const working = Boolean(run) && run?.status === "running";
  const settledCount = steps.filter(stepSettled).length;
  const activeKey = steps.find((step) => !stepSettled(step) && step.status !== "failed")?.key;
  const progress = run
    ? Math.max(6, Math.round((settledCount / Math.max(steps.length, 1)) * 100))
    : 0;
  const label = (step: SetupStep) =>
    setup.labels?.[step.key] ?? FALLBACK_LABELS[step.key] ?? "Working on your setup";

  return (
    <section className="mx-auto flex min-h-[68dvh] max-w-3xl items-center" aria-labelledby="setup-title">
      <Card className="w-full overflow-hidden rounded-3xl p-0">
        <Card.Content className="grid p-0 md:grid-cols-[11rem_minmax(0,1fr)]">
          <ClaudiaPortrait working={working} />
          <div className="flex flex-col justify-center p-6 sm:p-8 md:p-10">
            <p
              className={cn(
                "text-sm font-medium",
                stopped ? "text-danger" : run ? "text-accent" : "text-muted",
              )}
            >
              {stopped ? "Setup paused" : run ? "Claudia is getting ready" : "Ready to start"}
            </p>
            <h1 id="setup-title" className="type-display mt-3 text-3xl text-foreground sm:text-4xl">
              {stopped
                ? "Claudia hit a snag — your work is safe"
                : run
                  ? "Setting up your first week"
                  : "Let Claudia prepare your first week"}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted text-pretty">
              {stopped
                ? "Everything finished so far is saved, and the team has been alerted automatically. You can retry now, or Claudia will pick the work back up on her own."
                : run
                  ? "She's learning your brand and preparing her first actions. Each step checks off as she finishes it."
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
                  {settledCount} of {steps.length} steps done · You can leave—Claudia will continue.
                </p>
              </div>
            ) : null}

            {!run || stopped ? (
              <div className="mt-7">
                {subscribed ? (
                  <Button className="min-h-11" isPending={isPending} onPress={onStart}>
                    {stopped ? "Try again" : "Start Claudia"}
                  </Button>
                ) : (
                  <Link
                    href="/settings?tab=billing"
                    className={cn(buttonVariants(), "min-h-11 transition-transform active:scale-[0.96]")}
                  >
                    Choose work capacity
                  </Link>
                )}
              </div>
            ) : null}
          </div>
        </Card.Content>
      </Card>
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
