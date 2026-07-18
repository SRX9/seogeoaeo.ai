"use client";

import { Button, Card, Skeleton, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Section } from "@/components/feedback/section";
import { CheckIcon, GaugeIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useGoal } from "@/lib/api/queries";
import type { FirstOutcomeId } from "@/lib/onboarding/first-outcome";
import { GOAL_OPTIONS, type GoalView } from "@/lib/settings/goal";

function progressCopy(goal: GoalView) {
  if (goal.progress.status === "succeeded") return "This priority has reached its current target.";
  if (goal.progress.currentValue == null || goal.progress.targetValue == null) {
    return "Claudia is collecting the first reliable measurement.";
  }
  return `Current result ${goal.progress.currentValue.toLocaleString()} · target ${goal.progress.targetValue.toLocaleString()}`;
}

function GoalsSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading goals">
      <Skeleton className="h-32 rounded-3xl" />
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-2xl" />)}
      </div>
    </div>
  );
}

export function GoalsSection() {
  const goal = useGoal();
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (goalId: FirstOutcomeId) =>
      apiPatch<{ goal: GoalView }>("/api/agent/goal", { goalId }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.agentGoal, result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentObjective });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentStrategy });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      toast.success("Claudia's priority has been updated.");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not update this priority.")),
  });

  return (
    <Section query={goal} skeleton={<GoalsSkeleton />} errorLabel="Couldn't load your goals.">
      {(data) => (
        <div className="space-y-4">
          <Card className="rounded-3xl p-0">
            <Card.Content className="flex items-start gap-4 p-5 sm:p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
                <GaugeIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <ToneText tone="accent" className="text-xs">Current priority</ToneText>
                <h2 className="mt-1 text-lg font-semibold text-foreground">{data.goal.objective}</h2>
                <p className="mt-2 text-sm leading-6 text-muted">{progressCopy(data.goal)}</p>
              </div>
            </Card.Content>
          </Card>

          <div>
            <h2 className="text-base font-semibold text-foreground">What should Claudia improve first?</h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Choose one priority. Claudia will still support the other outcomes when they help.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {GOAL_OPTIONS.map((option) => {
              const selected = data.goal.selectedGoal === option.id;
              const busy = update.isPending && update.variables === option.id;
              return (
                <Button
                  key={option.id}
                  variant={selected ? "secondary" : "outline"}
                  className="h-auto min-h-28 justify-start gap-4 whitespace-normal p-5 text-left transition-transform active:scale-[0.96]"
                  aria-pressed={selected}
                  isDisabled={update.isPending}
                  isPending={busy}
                  onPress={() => {
                    if (!selected) update.mutate(option.id);
                  }}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
                    {selected ? <CheckIcon className="size-4 text-success" /> : <GaugeIcon className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold text-foreground">{option.label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted">{option.description}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </Section>
  );
}
