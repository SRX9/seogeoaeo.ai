"use client";

import { Card, ProgressBar } from "@heroui/react";
import { CheckIcon } from "@/components/icons";

export type DiscoveryStage = "brand" | "opportunities";

const DISCOVERY_STEPS = [
  {
    title: "Learning your brand",
    description: "Understanding what you sell and who it helps.",
  },
  {
    title: "Finding the best opportunities",
    description: "Comparing customer needs and competitor coverage.",
  },
  {
    title: "Preparing your first week",
    description: "Turning the strongest findings into useful work.",
  },
] as const;

function displayHost(website: string) {
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\//, "") || "your website";
  }
}

export function OnboardingDiscovery({
  brandName,
  website,
  stage,
}: {
  brandName: string;
  website: string;
  stage: DiscoveryStage;
}) {
  const activeIndex = stage === "brand" ? 0 : 1;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl items-center py-10">
      <Card className="w-full rounded-3xl p-0">
        <Card.Header className="p-6 pb-0 sm:p-8 sm:pb-0">
          <p className="text-sm font-medium text-accent">Claudia is getting ready</p>
          <Card.Title className="mt-2 text-2xl sm:text-3xl">
            Learning about {brandName || displayHost(website)}
          </Card.Title>
          <Card.Description className="mt-2">{displayHost(website)}</Card.Description>
        </Card.Header>
        <Card.Content className="space-y-6 p-6 sm:p-8">
          <ProgressBar value={activeIndex === 0 ? 33 : 66} aria-label="Brand discovery progress">
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <ol className="space-y-1" role="status" aria-live="polite">
            {DISCOVERY_STEPS.map((item, index) => {
              const done = index < activeIndex;
              const active = index === activeIndex;
              return (
                <li
                  key={item.title}
                  aria-current={active ? "step" : undefined}
                  className="flex min-h-16 items-start gap-3 py-3"
                >
                  <span
                    className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${
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
                  <span>
                    <strong className="block text-sm font-semibold text-foreground">
                      {item.title}
                    </strong>
                    <small className="mt-1 block text-sm leading-5 text-muted">
                      {item.description}
                    </small>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="text-sm text-muted">This usually takes less than a minute.</p>
        </Card.Content>
      </Card>
    </div>
  );
}
