"use client";

import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { Meter } from "@heroui/react/meter";
import Link from "next/link";
import type { OnboardingStep } from "@/lib/api/queries";

type OnboardingChecklistProps = {
  steps: OnboardingStep[];
};

export function OnboardingChecklist({ steps }: OnboardingChecklistProps) {
  const progress = {
    completed: steps.filter((step) => step.completed).length,
    total: steps.length,
  };
  const nextStep = steps.find((step) => !step.completed);

  if (progress.completed === progress.total) {
    return null;
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Getting started</Card.Title>
        <Card.Description>
          {nextStep ? `Next: ${nextStep.title}` : "You're all set"}
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-5">
        <Meter
          aria-label="Setup progress"
          color="success"
          size="sm"
          value={progress.completed}
          maxValue={progress.total}
        >
          <Meter.Track>
            <Meter.Fill />
          </Meter.Track>
        </Meter>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3 text-sm">
              <span
                className={
                  step.completed
                    ? "mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-success-soft text-xs text-success-soft-foreground"
                    : "mt-0.5 inline-flex size-5 items-center justify-center rounded-full border border-border text-xs text-muted"
                }
              >
                {step.completed ? "✓" : "·"}
              </span>
              <div>
                <Link href={step.href} className="font-medium text-foreground hover:text-muted">
                  {step.title}
                </Link>
                <p className="mt-1 text-muted">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card.Content>
      <Card.Footer className="items-center gap-4">
        {nextStep ? (
          <Link href={nextStep.href} className={buttonVariants({ size: "sm" })}>
            Continue setup
          </Link>
        ) : null}
        <Link href="/topics" className="text-sm text-muted hover:text-foreground">
          Explore topics instead
        </Link>
      </Card.Footer>
    </Card>
  );
}
