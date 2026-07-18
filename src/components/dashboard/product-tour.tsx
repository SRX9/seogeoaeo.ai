"use client";

import { Button, Card } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRightIcon,
  ChartBarIcon,
  ClaudiaIcon,
  UserInputIcon,
  XIcon,
} from "@/components/icons";
import { useMe } from "@/lib/api/queries";

const TOUR_VERSION = 1;
const TOUR_KEY_PREFIX = "claudia:product-tour";

const TOUR_STEPS = [
  {
    title: "Claudia works on your growth every day",
    description:
      "She researches demand, watches competitors, creates useful content, and improves what is underperforming.",
    Icon: ClaudiaIcon,
  },
  {
    title: "You do not need to manage her work",
    description:
      "If Claudia needs a decision, connection, or permission, it appears on Claudia with her recommendation.",
    Icon: UserInputIcon,
  },
  {
    title: "Results explain what changed",
    description:
      "See how search discovery, AI answers, content, and website health are changing—and what Claudia will do next.",
    Icon: ChartBarIcon,
  },
] as const;

type StoredTourState = {
  version: number;
  status: "completed" | "skipped";
};

function storageKey(userId: string) {
  return `${TOUR_KEY_PREFIX}:v${TOUR_VERSION}:${userId}`;
}

function hasSeenTour(userId: string) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredTourState>;
    return (
      parsed.version === TOUR_VERSION &&
      (parsed.status === "completed" || parsed.status === "skipped")
    );
  } catch {
    return false;
  }
}

function saveTourState(userId: string, status: StoredTourState["status"]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ version: TOUR_VERSION, status }));
  } catch {
    // The tour can still be dismissed for this session when storage is blocked.
  }
}

function removeReplayQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("tour")) return;
  url.searchParams.delete("tour");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function ProductTour() {
  const me = useMe();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const userId = me.data?.user.id ?? null;
  const replayRequested = searchParams.get("tour") === "1";

  useEffect(() => {
    if (!userId) return;
    if (replayRequested || !hasSeenTour(userId)) {
      setStepIndex(0);
      setIsOpen(true);
    }
  }, [replayRequested, userId]);

  if (!isOpen || !userId) return null;

  const step = TOUR_STEPS[stepIndex];
  const finalStep = stepIndex === TOUR_STEPS.length - 1;
  const finish = (status: StoredTourState["status"]) => {
    saveTourState(userId, status);
    setIsOpen(false);
    setStepIndex(0);
    removeReplayQuery();
  };

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 ml-auto max-w-md sm:inset-x-auto sm:bottom-6 sm:right-6">
      <Card
        role="dialog"
        aria-modal="false"
        aria-labelledby="product-tour-title"
        className="rounded-3xl border border-border/70 p-0 shadow-xl transition-[opacity,transform] motion-reduce:transition-none"
      >
        <Card.Header className="flex-row items-start justify-between gap-4 p-6 pb-0">
          <p className="text-sm font-medium text-muted">
            A quick tour · {stepIndex + 1} of {TOUR_STEPS.length}
          </p>
          <Button isIconOnly variant="ghost" aria-label="Close product tour" onPress={() => finish("skipped")}>
            <XIcon className="size-4" />
          </Button>
        </Card.Header>
        <Card.Content className="p-6 pt-5">
          <span
            className="grid size-12 place-items-center rounded-xl bg-surface-secondary text-accent"
            aria-hidden
          >
            <step.Icon className="size-6" />
          </span>
          <h2 id="product-tour-title" className="mt-5 text-xl font-semibold tracking-tight text-foreground">
            {step.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
        </Card.Content>
        <Card.Footer className="flex-row items-center justify-between gap-3 border-t border-separator px-6 py-5">
          <Button variant="ghost" onPress={() => finish("skipped")}>
            Skip tour
          </Button>
          <Button
            className="active:scale-[0.96]"
            onPress={() => {
              if (finalStep) finish("completed");
              else setStepIndex((current) => current + 1);
            }}
          >
            {finalStep ? "Let Claudia work" : "Next"}
            {!finalStep ? <ArrowRightIcon className="size-4" /> : null}
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
