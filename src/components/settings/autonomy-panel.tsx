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
      toast.success(
        autonomyMode === "FULL_AUTO"
          ? "Auto-publish on — new articles publish automatically."
          : "Review mode on — new articles stay as drafts until you approve them.",
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
        <Card.Title>Autonomy mode</Card.Title>
        <Card.Description>
          Controls the default status for this brand&apos;s scheduled and generated articles. Each
          brand is set independently.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-foreground">Auto-publish</p>
            <p className="mt-1 text-sm text-muted">
              {isAuto
                ? "New articles are approved and publish automatically when connectors are enabled."
                : "New articles stay as drafts until you review and approve them."}
            </p>
          </div>
          <Switch
            aria-label="Auto-publish"
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
              <AlertDialog.Heading>Turn on auto-publish?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                New articles will be approved and published automatically to every enabled
                destination — with no review step. You can switch back to review mode anytime.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button slot="close" onPress={() => apply("FULL_AUTO")}>
                Enable auto-publish
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </Card>
  );
}
