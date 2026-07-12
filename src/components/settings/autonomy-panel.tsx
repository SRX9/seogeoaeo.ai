"use client";

import { AlertDialog, Button, Card, Switch, toast, useOverlayState } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/queries";

type AutonomyPanelProps = {
  brandId: string;
  currentMode: string;
};

export function AutonomyPanel({ brandId, currentMode }: AutonomyPanelProps) {
  const [mode, setMode] = useState(() => currentMode);
  const queryClient = useQueryClient();
  const confirm = useOverlayState();
  const isAuto = mode === "FULL_AUTO";

  const update = useMutation({
    mutationFn: (autonomyMode: "FULL_AUTO" | "REVIEW") =>
      apiPatch("/api/brand/settings", { brandId, autonomyMode }),
    onSuccess: (_data, autonomyMode) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      // The dial sets the per-category defaults shown below it.
      queryClient.invalidateQueries({ queryKey: queryKeys.brandAutonomy });
      toast.success(
        autonomyMode === "FULL_AUTO"
          ? "Autopilot is on. Claudia publishes articles and prepares site fixes."
          : "Copilot is on. Claudia prepares the work and asks before publishing.",
      );
    },
    onError: (error, autonomyMode) => {
      // Revert the optimistic toggle if the save failed.
      setMode(autonomyMode === "FULL_AUTO" ? "REVIEW" : "FULL_AUTO");
      toast.danger(getErrorMessage(error, "Could not update autonomy mode"));
    },
  });
  const pending = update.isPending;

  function apply(nextMode: "FULL_AUTO" | "REVIEW") {
    setMode(nextMode);
    update.mutate(nextMode);
  }

  function handleToggle(next: boolean) {
    // Enabling auto-publish is high-impact (publishes to live destinations with
    // no review step), so confirm first. Turning it off is safe and immediate.
    if (next) {
      confirm.open();
      return;
    }
    apply("REVIEW");
  }

  return (
    <Card className="material-panel">
      <Card.Header>
        <Card.Title className="tracking-tight">How Claudia works</Card.Title>
        <Card.Description className="leading-relaxed">
          One dial for both halves of her job: writing and fixing. Each brand is set
          independently; fine-tune individual areas below.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium tracking-tight text-foreground">
              {isAuto ? "Autopilot" : "Copilot"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {isAuto
                ? "She publishes articles to connected destinations and prepares ready-to-install site fixes in your inbox. You install site artifacts; she re-checks next audit."
                : "She prepares articles and site fixes, then waits for your approval before publishing articles."}
            </p>
          </div>
          <Switch
            aria-label="Autopilot"
            isSelected={isAuto}
            isDisabled={pending}
            onChange={handleToggle}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
      </Card.Content>

      <AlertDialog.Backdrop isOpen={confirm.isOpen} onOpenChange={confirm.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Turn on Autopilot?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                Claudia will publish new articles to every enabled destination without a review
                step, and prepare ready-to-install site fixes (robots, schema, meta) in your
                inbox for you to deploy. Article actions are logged and idempotent; rollback is
                shown only when the connector supports it. You can switch back to Copilot anytime.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button slot="close" onPress={() => apply("FULL_AUTO")}>
                Enable Autopilot
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </Card>
  );
}
