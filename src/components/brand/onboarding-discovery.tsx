"use client";

import { Card, ProgressBar } from "@heroui/react";
import { ClaudiaOrb } from "@/components/claudia/claudia-orb";
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
    <main className="mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-10 py-10 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(24rem,1.2fr)] lg:gap-16">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <ClaudiaOrb working size="processing" />
        <p className="mt-6 flex items-center gap-2 text-sm font-medium text-accent">
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent/35 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          Claudia is reading your public site
        </p>
        <h1 className="type-display mt-3 max-w-lg text-3xl text-foreground text-pretty sm:text-4xl">
          Learning about {brandName || displayHost(website)}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted">
          She is building a first-pass understanding so you only need to correct what matters.
        </p>
      </div>

      <Card className="w-full rounded-[2rem] p-0 shadow-[0_0_0_1px_oklch(0_0_0/0.05),0_24px_70px_-42px_oklch(0_0_0/0.3)]">
        <Card.Header className="p-6 pb-0 sm:p-8 sm:pb-0">
          <div className="flex w-full items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-muted">Brand prefill</p>
              <Card.Title className="mt-1 text-xl">Building your starting point</Card.Title>
            </div>
            <span className="text-sm font-medium text-muted tabular-nums">
              {activeIndex === 0 ? "33%" : "66%"}
            </span>
          </div>
        </Card.Header>
        <Card.Content className="space-y-6 p-6 sm:p-8">
          <ProgressBar
            value={activeIndex === 0 ? 33 : 66}
            aria-label="Brand discovery progress"
          >
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
          <ol className="divide-y divide-separator" role="status" aria-live="polite">
            {DISCOVERY_STEPS.map((item, index) => {
              const done = index < activeIndex;
              const active = index === activeIndex;
              return (
                <li
                  key={item.title}
                  aria-current={active ? "step" : undefined}
                  className="flex min-h-20 items-start gap-4 py-4 first:pt-1 last:pb-1"
                >
                  <span
                    className={`relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
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
          <p className="text-sm leading-6 text-muted">
            This usually takes less than a minute. Keep this tab open while Claudia prefills the details.
          </p>
        </Card.Content>
      </Card>
    </main>
  );
}
