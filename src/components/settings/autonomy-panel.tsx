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
          ? "Autopilot on — Claudia publishes and applies safe fixes herself."
          : "Copilot on — Claudia prepares everything and asks before acting.",
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
    <Card>
      <Card.Header>
        <Card.Title>How Claudia works</Card.Title>
        <Card.Description>
          One dial for both halves of her job — writing and fixing. Each brand is set
          independently; fine-tune individual areas below.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{isAuto ? "Autopilot" : "Copilot"}</p>
            <p className="mt-1 text-sm text-muted">
              {isAuto
                ? "She publishes articles herself and applies safe fixes herself. Everything logged, everything reversible."
                : "She prepares articles and fixes, then waits for your one-click approval before anything goes live."}
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
                Claudia will publish new articles to every enabled destination and apply safe
                fixes on her own — no review step. Every action is logged and reversible, and
                you can switch back to Copilot anytime.
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
