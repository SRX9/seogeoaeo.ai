"use client";

import { AlertDialog, Button, Card, Skeleton, toast, useOverlayState } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { CalendarIcon, ClaudiaIcon } from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { combineQueries, queryKeys, useAgentState, useAutomation } from "@/lib/api/queries";
import type { SteeringResult } from "@/lib/agent/types";
import { Section } from "@/components/feedback/section";

function PreferencesSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading work preferences">
      <Skeleton className="h-52 rounded-3xl" />
      <Skeleton className="h-36 rounded-3xl" />
    </div>
  );
}

export function WorkPreferencesSection() {
  const agentState = useAgentState();
  const automation = useAutomation();
  const query = combineQueries(agentState, automation);
  const queryClient = useQueryClient();
  const confirmPause = useOverlayState();
  const steer = useMutation({
    mutationFn: (message: string) => apiPost<SteeringResult>("/api/agent/steer", { message }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      toast.success(result.title);
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not update Claudia's work preference.")),
  });

  return (
    <div className="space-y-4">
      <Section query={query} skeleton={<PreferencesSkeleton />} errorLabel="Couldn't load work preferences.">
        {([stateData, automationData]) => {
          const ownerPaused = stateData.presence.id === "paused" && stateData.presence.reason.toLowerCase().includes("owner");
          const systemPaused = stateData.presence.id === "paused" && !ownerPaused;
          const schedule = automationData.schedule?.split("·")[0]?.trim() || "Every day";
          return (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card className="rounded-3xl p-0">
                <Card.Header className="flex-row items-start gap-4 p-5 pb-3 sm:p-6 sm:pb-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
                    <CalendarIcon className="size-4" />
                  </span>
                  <div>
                    <Card.Title>Work rhythm</Card.Title>
                    <Card.Description>When Claudia checks, creates, and improves work.</Card.Description>
                  </div>
                </Card.Header>
                <Card.Content className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
                  <div className="flex items-start justify-between gap-4 border-t border-separator pt-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Daily work</p>
                      <p className="mt-1 text-xs leading-5 text-muted">Research, writing, and monitoring</p>
                    </div>
                    <p className="shrink-0 text-sm text-foreground">{schedule}</p>
                  </div>
                  <div className="flex items-start justify-between gap-4 border-t border-separator pt-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">Content pace</p>
                      <p className="mt-1 text-xs leading-5 text-muted">Always limited by your plan and quality checks</p>
                    </div>
                    <p className="shrink-0 text-sm text-foreground">
                      {automationData.dailyCap > 0
                        ? `Up to ${automationData.dailyCap} per day`
                        : "Plan limits"}
                    </p>
                  </div>
                </Card.Content>
              </Card>

              <Card className="rounded-3xl p-0">
                <Card.Header className="flex-row items-start gap-4 p-5 pb-3 sm:p-6 sm:pb-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
                    <ClaudiaIcon className="size-4" />
                  </span>
                  <div>
                    <Card.Title>{ownerPaused || systemPaused ? "Claudia is paused" : "Claudia is working"}</Card.Title>
                    <Card.Description>
                      {systemPaused
                        ? stateData.presence.reason
                        : ownerPaused
                          ? "She will not start new work until you resume."
                          : "She will keep working on the schedule above."}
                    </Card.Description>
                  </div>
                </Card.Header>
                <Card.Footer className="p-5 pt-2 sm:p-6 sm:pt-2">
                  <LoadingButton
                    fullWidth
                    variant="outline"
                    className="min-h-11 transition-transform active:scale-[0.96]"
                    isPending={steer.isPending}
                    isDisabled={systemPaused}
                    onPress={() => {
                      if (ownerPaused) steer.mutate("Resume all automation.");
                      else confirmPause.open();
                    }}
                  >
                    {systemPaused ? "Needs account attention" : ownerPaused ? "Resume Claudia" : "Pause Claudia"}
                  </LoadingButton>
                </Card.Footer>
              </Card>
            </div>
          );
        }}
      </Section>

      <NotificationsSection />

      <AlertDialog.Backdrop isOpen={confirmPause.isOpen} onOpenChange={confirmPause.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Pause Claudia for 7 days?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Claudia will stop starting new work. Completed work and saved preferences stay unchanged, and you can resume early.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Cancel</Button>
              <LoadingButton slot="close" variant="secondary" isPending={steer.isPending} onPress={() => steer.mutate("Pause all automation for 7 days.")}>Pause Claudia</LoadingButton>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
