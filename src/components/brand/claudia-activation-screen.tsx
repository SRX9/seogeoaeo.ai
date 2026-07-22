"use client";

import { Alert, Button, Card, ProgressBar } from "@heroui/react";
import { ClaudiaOrb } from "@/components/claudia/claudia-orb";
import { CheckIcon } from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";

const ACTIVATION_STEPS = [
  "Learning your brand",
  "Finding the best opportunities",
  "Preparing your first week",
] as const;

export function ClaudiaActivationScreen({
  brandName,
  subscribed,
  isCreating,
  needsRetry,
  errorMessage,
  onRetry,
  onExit,
}: {
  brandName: string;
  subscribed: boolean;
  isCreating: boolean;
  needsRetry: boolean;
  errorMessage: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  const displayName = brandName.trim() || "your brand";
  const activeStep = subscribed || isCreating ? 2 : 1;

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-10 bg-background px-5 py-10 sm:px-8 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(24rem,1.2fr)] lg:gap-16">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <ClaudiaOrb working={isCreating || !needsRetry} size="processing" />
        <p className="mt-6 flex items-center gap-2 text-sm font-medium text-accent">
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/35 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          Starting Claudia
        </p>
        <h1 className="type-display mt-3 max-w-lg text-3xl text-foreground text-pretty sm:text-4xl">
          Preparing the first week for {displayName}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted">
          Your answers and payment state remain safe while Claudia creates the workspace.
        </p>
      </div>

      <Card className="w-full rounded-[2rem] p-0 shadow-[0_0_0_1px_oklch(0_0_0/0.05),0_24px_70px_-42px_oklch(0_0_0/0.3)]">
        <Card.Header className="p-6 pb-0 sm:p-8 sm:pb-0">
          <p className="text-sm font-medium text-muted">Workspace activation</p>
          <Card.Title className="mt-1 text-xl">Almost ready</Card.Title>
        </Card.Header>
        <Card.Content className="space-y-6 p-6 sm:p-8">
          <ProgressBar
            value={((activeStep + 1) / ACTIVATION_STEPS.length) * 100}
            aria-label="Claudia setup progress"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <ol className="divide-y divide-separator" aria-live="polite">
            {ACTIVATION_STEPS.map((label, index) => {
              const done = index < activeStep;
              const active = index === activeStep;
              return (
                <li
                  key={label}
                  aria-current={active ? "step" : undefined}
                  className="flex min-h-16 items-center gap-4 py-3"
                >
                  <span
                    className={`relative grid size-7 shrink-0 place-items-center rounded-full ${
                      done
                        ? "bg-success/10 text-success"
                        : active
                          ? "bg-accent/10 text-accent"
                          : "bg-surface-secondary text-muted"
                    }`}
                    aria-hidden
                  >
                    {done ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <>
                        {active ? (
                          <span className="absolute size-3 animate-ping rounded-full bg-accent/30 motion-reduce:animate-none" />
                        ) : null}
                        <span className="size-1.5 rounded-full bg-current" />
                      </>
                    )}
                  </span>
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  {active ? <span className="ml-auto text-xs text-muted">In progress</span> : null}
                </li>
              );
            })}
          </ol>
          {needsRetry ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Setup needs another try</Alert.Title>
                <Alert.Description>{errorMessage}</Alert.Description>
                <LoadingButton className="mt-4" isPending={isCreating} onPress={onRetry}>
                  Try again
                </LoadingButton>
              </Alert.Content>
            </Alert>
          ) : (
            <p className="text-sm leading-6 text-muted">
              You can leave this page. Claudia will continue preparing the workspace.
            </p>
          )}
        </Card.Content>
        <Card.Footer className="justify-end border-t border-separator px-6 py-5 sm:px-8">
          <Button variant="secondary" onPress={onExit}>
            Save and exit
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}
