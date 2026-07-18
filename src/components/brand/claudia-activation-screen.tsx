"use client";

import { Alert, Button, Card, ProgressBar } from "@heroui/react";
import { CheckIcon } from "@/components/icons";

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
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-12">
      <Card className="w-full max-w-xl rounded-3xl p-0">
        <Card.Header className="p-6 pb-0 sm:p-8 sm:pb-0">
          <p className="text-sm font-medium text-accent">Starting Claudia</p>
          <Card.Title className="mt-2 text-2xl sm:text-3xl">
            Preparing the first week for {displayName}
          </Card.Title>
          <Card.Description className="mt-2">
            Your answers and payment state remain safe throughout setup.
          </Card.Description>
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
          <ol className="space-y-1" aria-live="polite">
            {ACTIVATION_STEPS.map((label, index) => {
              const done = index < activeStep;
              const active = index === activeStep;
              return (
                <li
                  key={label}
                  aria-current={active ? "step" : undefined}
                  className="flex min-h-14 items-center gap-3 py-2"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full ${
                      done
                        ? "bg-success-soft text-success"
                        : active
                          ? "bg-accent-soft text-accent-soft-foreground"
                          : "bg-surface-secondary text-muted"
                    }`}
                    aria-hidden
                  >
                    {done ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
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
                <Button className="mt-4" isPending={isCreating} onPress={onRetry}>
                  Try again
                </Button>
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
    </div>
  );
}
