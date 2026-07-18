"use client";

import { Button, Card, ProgressBar, buttonVariants } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { CheckIcon, ClaudiaIcon } from "@/components/icons";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { apiPost } from "@/lib/api/fetcher";
import { queryKeys, useMe, type SetupRunResponse, type SetupStep } from "@/lib/api/queries";
import { isActiveSubscription } from "@/lib/billing/plans";
import { cn } from "@/lib/cn";

const HUMAN_STAGES = [
  {
    title: "Learning your brand",
    description: "Reading the site and understanding what you sell and who it helps.",
    keys: new Set(["first_audit", "seed_prompts"]),
  },
  {
    title: "Finding the best opportunities",
    description: "Comparing buyer questions, competitors, and content gaps.",
    keys: new Set(["answer_check", "competitor_baseline", "topic_research"]),
  },
  {
    title: "Preparing your first week",
    description: "Preparing the first improvements, article, and plain-language summary.",
    keys: new Set(["quick_win_fixes", "first_article", "day0_brief"]),
  },
] as const;

function stageComplete(steps: SetupStep[], keys: ReadonlySet<string>) {
  const relevant = steps.filter((step) => keys.has(step.key));
  return (
    relevant.length > 0 &&
    relevant.every((step) => step.status === "done" || step.status === "skipped")
  );
}

function activeStageIndex(steps: SetupStep[]) {
  const firstIncomplete = HUMAN_STAGES.findIndex((stage) => !stageComplete(steps, stage.keys));
  return firstIncomplete === -1 ? HUMAN_STAGES.length - 1 : firstIncomplete;
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
  const failed = run?.status === "failed";
  const stageIndex = activeStageIndex(steps);
  const stage = HUMAN_STAGES[stageIndex];
  const completedStages = HUMAN_STAGES.filter((item) => stageComplete(steps, item.keys)).length;
  const progress = run ? Math.max(12, Math.round((completedStages / HUMAN_STAGES.length) * 100)) : 0;

  return (
    <section className="mx-auto flex min-h-[68dvh] max-w-3xl items-center" aria-labelledby="setup-title">
      <Card className="w-full overflow-hidden rounded-3xl p-0">
        <Card.Content className="grid p-0 md:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="grid min-h-32 place-items-center bg-surface-secondary p-6 md:min-h-[26rem]">
            <span
              className="grid size-20 place-items-center rounded-full bg-surface text-accent"
              aria-hidden
            >
              <ClaudiaIcon className="size-10" />
            </span>
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8 md:p-10">
            <p
              className={cn(
                "text-sm font-medium",
                failed ? "text-danger" : run ? "text-accent" : "text-muted",
              )}
            >
              {failed ? "Technical problem" : run ? "Claudia is getting ready" : "Ready to start"}
            </p>
            <h1 id="setup-title" className="type-display mt-3 text-3xl text-foreground sm:text-4xl">
              {failed ? "Your saved work is safe" : run ? stage.title : "Let Claudia prepare your first week"}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted text-pretty">
              {failed
                ? "Claudia hit a technical problem. The completed work is saved and the problem has been recorded."
                : run
                  ? stage.description
                  : "She will learn the brand, find the strongest opportunities, and prepare useful first actions."}
            </p>

            {run && !failed ? (
              <div className="mt-7 space-y-3">
                <ProgressBar value={progress} aria-label="Claudia setup progress">
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
                <p className="flex items-center gap-2 text-sm text-muted">
                  {completedStages > 0 ? <CheckIcon className="size-4 text-success" /> : null}
                  Stage {stageIndex + 1} of {HUMAN_STAGES.length}
                </p>
              </div>
            ) : null}

            {!run ? (
              <div className="mt-7">
                {subscribed ? (
                  <Button className="min-h-11" isPending={isPending} onPress={onStart}>
                    Start Claudia
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

            {run && !failed ? (
              <p className="mt-7 text-sm text-muted">You can leave—Claudia will continue.</p>
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
      setup={setup}
      isPending={start.isPending}
      subscribed={isActiveSubscription(me.data?.subscription?.status)}
      onStart={() => start.mutate()}
    />
  );
}
