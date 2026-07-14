"use client";

import { Timeline } from "@heroui-pro/react";
import { Card, buttonVariants } from "@heroui/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SteerClaudia } from "@/components/dashboard/steer-claudia";
import {
  ActivityIcon,
  ArrowRightIcon,
  AutomationIcon,
  CalendarIcon,
  CheckIcon,
  UserInputIcon,
} from "@/components/icons";
import type { AgentState, AgentWaitingView } from "@/lib/agent/types";
import { cn } from "@/lib/cn";
import styles from "./claudia-work-panel.module.css";

type ClaudiaMode = "working" | "halted" | "ready";
type TimelineState =
  | "done"
  | "working"
  | "halted"
  | "next"
  | "queued"
  | "ready";

type TimelineEntry = {
  id: string;
  label: string;
  title: string;
  detail: string | null;
  state: TimelineState;
  status: string;
  timestamp: string | null;
  timeLabel: string;
};

type UnblockAction = {
  href: string;
  label: string;
};

type UnblockGuide = {
  action: UnblockAction;
  blockingReason: string;
  instruction: string;
  title: string;
};

const CLAUDIA_REST_TRANSFORM =
  "perspective(1100px) translate3d(0%, 0%, 0) rotate3d(0.55, -0.7, 0.45, 0deg) rotateZ(0deg) scale(1)";

const CLAUDIA_WORKING_TRANSFORMS = [
  CLAUDIA_REST_TRANSFORM,
  "perspective(1100px) translate3d(3%, -2%, 0) rotate3d(0.55, -0.7, 0.45, 18deg) rotateZ(82deg) scale(1.06)",
  "perspective(1100px) translate3d(-2%, 3%, 0) rotate3d(-0.65, 0.25, 0.7, -14deg) rotateZ(46deg) scale(1.02)",
  "perspective(1100px) translate3d(2%, 2%, 0) rotate3d(0.15, 0.9, -0.4, 22deg) rotateZ(194deg) scale(1.08)",
  "perspective(1100px) translate3d(-3%, -2%, 0) rotate3d(-0.8, -0.35, 0.4, -18deg) rotateZ(142deg) scale(1.03)",
  "perspective(1100px) translate3d(2%, -3%, 0) rotate3d(0.65, 0.25, 0.7, 15deg) rotateZ(320deg) scale(1.07)",
  "perspective(1100px) translate3d(-2%, 2%, 0) rotate3d(-0.2, 0.85, 0.48, -20deg) rotateZ(278deg) scale(1.02)",
  "perspective(1100px) translate3d(3%, 1%, 0) rotate3d(0.7, -0.55, 0.28, 13deg) rotateZ(424deg) scale(1.06)",
  "perspective(1100px) translate3d(0%, 0%, 0) rotate3d(0.55, -0.7, 0.45, 0deg) rotateZ(360deg) scale(1)",
];

const scheduledFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

const timelineFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function isHalted(state: AgentState) {
  return ["needs_attention", "waiting_for_you", "paused"].includes(
    state.presence.id,
  );
}

function getUnblockAction(
  state: AgentState,
  halted: boolean,
): UnblockAction | null {
  if (!halted) return null;
  if (state.waiting) {
    return {
      href: state.waiting.href,
      label:
        state.waiting.kind === "recovery"
          ? "Recover task"
          : state.waiting.actionLabel,
    };
  }
  if (state.presence.id === "needs_attention") {
    return { href: "/activity", label: "Recover task" };
  }

  const reason = state.presence.reason.toLowerCase();
  if (reason.includes("credit")) {
    return { href: "/account?tab=billing", label: "Add credits" };
  }
  if (reason.includes("plan") || reason.includes("subscription")) {
    return { href: "/account?tab=billing", label: "Review plan" };
  }
  return { href: "/settings?tab=automation", label: "Resume automation" };
}

function getWaitingInstruction(waiting: AgentWaitingView) {
  if (waiting.kind === "approval") {
    return "Review the pending approval and approve or reject it. Claudia will continue as soon as the decision is recorded.";
  }
  if (waiting.kind === "connection") {
    return "Connect the required service and finish its setup check. Claudia will resume automatically when the connection is healthy.";
  }
  if (waiting.kind === "decision") {
    return "Open the decision, choose the path Claudia should take, and save it. The blocked task will then return to the queue.";
  }
  return "The task stopped reporting activity. Open its record, then restart it or dismiss it so Claudia can continue with the queue.";
}

function getUnblockGuide(
  state: AgentState,
  action: UnblockAction | null,
): UnblockGuide | null {
  if (!action) return null;
  if (state.waiting) {
    const title =
      state.waiting.kind === "recovery"
        ? "Task heartbeat stopped"
        : state.waiting.kind === "approval"
          ? "Approval required"
          : state.waiting.kind === "connection"
            ? "Connection required"
            : "Your decision is required";

    return {
      action,
      blockingReason: state.waiting.blockedValue,
      instruction: getWaitingInstruction(state.waiting),
      title,
    };
  }

  const reason = state.presence.reason.toLowerCase();
  const instruction = reason.includes("credit")
    ? "Add enough credits for the next task. Claudia will resume automatically after the balance updates."
    : reason.includes("plan") || reason.includes("subscription")
      ? "Restore an active plan so Claudia can schedule and run the next task."
      : "Open automation settings and resume Claudia when you are ready for work to continue.";

  return {
    action,
    blockingReason: state.presence.reason,
    instruction,
    title: "Automation is paused",
  };
}

function scheduledLabel(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : scheduledFormatter.format(date);
}

function timelineLabel(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : timelineFormatter.format(date);
}

function buildTimeline(state: AgentState, mode: ClaudiaMode): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const latest = state.recentEvents[0];
  const blockingItem = state.waiting;

  if (latest) {
    entries.push({
      id: `done-${latest.id}`,
      label: "Latest",
      title: latest.summary,
      detail: null,
      state: "done",
      status: "Completed",
      timestamp: latest.createdAt,
      timeLabel: timelineLabel(latest.createdAt, "Completed"),
    });
  }

  if (state.now) {
    const timestamp = state.now.startedAt ?? latest?.createdAt ?? null;
    entries.push({
      id: `now-${state.now.id}`,
      label: "Now",
      title: state.now.title,
      detail: state.now.reason,
      state:
        mode === "working" ? "working" : mode === "halted" ? "halted" : "ready",
      status:
        mode === "working"
          ? "Working"
          : mode === "halted"
            ? "Waiting for input"
            : "Current",
      timestamp,
      timeLabel: timelineLabel(
        timestamp,
        mode === "halted" ? "Waiting" : "Now",
      ),
    });
  } else if (mode === "halted") {
    const timestamp = latest?.createdAt ?? null;
    entries.push({
      id: `halted-${blockingItem?.id ?? state.presence.id}`,
      label: "Now",
      title: blockingItem?.title ?? "Waiting for your input",
      detail: blockingItem?.blockedValue ?? state.presence.reason,
      state: "halted",
      status: "Waiting for input",
      timestamp,
      timeLabel: timelineLabel(timestamp, "Waiting"),
    });
  } else {
    entries.push({
      id: `ready-${state.presence.id}`,
      label: "Now",
      title: "Standing by for the next useful task",
      detail: state.presence.reason,
      state: "ready",
      status: state.presence.label,
      timestamp: null,
      timeLabel: "Ready",
    });
  }

  state.next.slice(0, 2).forEach((task, index) => {
    entries.push({
      id: `next-${task.id}`,
      label: index === 0 ? "Next" : "Later",
      title: task.title,
      detail: task.expectedImpact ?? task.reason,
      state: index === 0 ? "next" : "queued",
      status: index === 0 ? "Next task" : "Queued",
      timestamp: task.scheduledFor,
      timeLabel: timelineLabel(
        task.scheduledFor,
        index === 0 ? "After current" : "Queued",
      ),
    });
  });

  if (state.next.length === 0) {
    entries.push({
      id: "next-clear",
      label: "Next",
      title: "Queue is clear",
      detail: "Claudia will choose the next task from fresh evidence.",
      state: "queued",
      status: "No task queued",
      timestamp: null,
      timeLabel: "Not scheduled",
    });
  }

  return entries.slice(0, 4);
}

function timelineStatus(state: TimelineState) {
  if (state === "done") return "success" as const;
  if (state === "working") return "current" as const;
  if (state === "halted") return "default" as const;
  if (state === "queued") return "muted" as const;
  return "default" as const;
}

function TimelineEntryIcon({ state }: { state: TimelineState }) {
  if (state === "done") return <CheckIcon className="size-3.5" />;
  if (state === "working") return <ActivityIcon className="size-3.5" />;
  if (state === "halted") return <UserInputIcon className="size-3.5" />;
  if (state === "next") return <ArrowRightIcon className="size-3.5" />;
  if (state === "ready") return <AutomationIcon className="size-3.5" />;
  return <CalendarIcon className="size-3.5" />;
}

function ExecutionActivity({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <span
      role="status"
      aria-label="Claudia is working"
      className="inline-flex size-6 items-center justify-center text-accent"
    >
      <span className="flex h-4 items-end gap-0.5" aria-hidden>
        {[0, 1, 2].map((bar) => (
          <motion.span
            key={bar}
            className="block h-4 w-0.5 origin-bottom bg-current"
            animate={
              reduceMotion
                ? { transform: "scaleY(0.65)" }
                : {
                    transform: ["scaleY(0.35)", "scaleY(1)", "scaleY(0.45)"],
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: 0.8,
                    delay: bar * 0.14,
                    ease: [0.77, 0, 0.175, 1],
                    repeat: Number.POSITIVE_INFINITY,
                  }
            }
          />
        ))}
      </span>
    </span>
  );
}

function WorkTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Timeline
      className="mt-5"
      density="comfortable"
      size="sm"
      aria-label="Claudia's current work timeline"
      aria-live="polite"
    >
      {entries.map((entry) => {
        const active = entry.state === "working" || entry.state === "halted";

        return (
          <Timeline.Item
            key={entry.id}
            align="start"
            status={timelineStatus(entry.state)}
          >
            <Timeline.Marker aria-hidden="true">
              <TimelineEntryIcon state={entry.state} />
            </Timeline.Marker>
            <Timeline.Content className="min-w-0 pb-1">
              <article
                className={cn(
                  "min-w-0 pb-3",
                  active && "rounded-2xl px-4 pb-4 pt-3 shadow-sm",
                  entry.state === "working" && "bg-surface-secondary/65",
                  entry.state === "halted" && styles.waitingSurface,
                )}
              >
                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-xs font-medium text-muted">
                      {entry.label}
                    </span>
                    <span className="sr-only">{entry.status}</span>
                  </div>
                  {entry.timestamp ? (
                    <time
                      className="shrink-0 text-xs leading-5 text-muted tabular-nums"
                      dateTime={entry.timestamp}
                      suppressHydrationWarning
                    >
                      {entry.timeLabel}
                    </time>
                  ) : (
                    <span className="shrink-0 text-xs leading-5 text-muted tabular-nums">
                      {entry.timeLabel}
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-sm font-semibold leading-5 tracking-[-0.01em] text-foreground text-pretty">
                  {entry.title}
                </h3>
                {entry.detail ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted text-pretty">
                    {entry.detail}
                  </p>
                ) : null}
              </article>
            </Timeline.Content>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}

function MediaStatus({
  mode,
  label,
  reduceMotion,
}: {
  mode: ClaudiaMode;
  label: string;
  reduceMotion: boolean;
}) {
  const Icon =
    mode === "halted"
      ? UserInputIcon
      : mode === "working"
        ? ActivityIcon
        : AutomationIcon;

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.div
        key={mode}
        className={cn(
          "absolute left-5 top-5 z-[4] flex items-center gap-2 text-sm font-semibold tracking-[-0.01em]",
          styles.mediaStatus,
          mode === "working" ? "text-accent" : "text-foreground",
        )}
        initial={
          reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, filter: "blur(4px)", transform: "scale(0.97)" }
        }
        animate={
          reduceMotion
            ? { opacity: 1 }
            : { opacity: 1, filter: "blur(0px)", transform: "scale(1)" }
        }
        exit={
          reduceMotion
            ? { opacity: 0 }
            : { opacity: 0, filter: "blur(4px)", transform: "scale(0.97)" }
        }
        transition={
          reduceMotion
            ? { duration: 0.18, ease: [0.23, 1, 0.32, 1] }
            : { type: "spring", bounce: 0, duration: 0.3 }
        }
      >
        <Icon className="size-4" />
        <span>{label}</span>
      </motion.div>
    </AnimatePresence>
  );
}

function ClaudiaMedia({
  working,
  reduceMotion,
  mode,
  statusLabel,
  children,
}: {
  working: boolean;
  reduceMotion: boolean;
  mode: ClaudiaMode;
  statusLabel: string;
  children: ReactNode;
}) {
  const animateLogo = working && !reduceMotion;

  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl",
        styles.media,
        mode === "halted" && styles.mediaWaiting,
      )}
    >
      <motion.div
        className={cn(
          styles.logoStage,
          animateLogo && styles.logoStageWorking,
        )}
        initial={false}
        animate={{
          transform: animateLogo
            ? CLAUDIA_WORKING_TRANSFORMS
            : CLAUDIA_REST_TRANSFORM,
        }}
        transition={
          animateLogo
            ? {
                duration: 16,
                ease: [0.77, 0, 0.175, 1],
                repeat: Number.POSITIVE_INFINITY,
                times: [0, 0.09, 0.25, 0.34, 0.55, 0.63, 0.82, 0.9, 1],
              }
            : { type: "spring", bounce: 0, duration: 0.45 }
        }
      >
        <Image
          fill
          priority
          alt="Claudia"
          className={styles.logo}
          sizes="(min-width: 1280px) 58vw, (min-width: 768px) 100vw, 132vw"
          src="/claudia-bg-free-logo.png"
        />
      </motion.div>
      <MediaStatus
        mode={mode}
        label={statusLabel}
        reduceMotion={reduceMotion}
      />
      <div className={styles.mediaActions}>{children}</div>
    </div>
  );
}

function UnblockGuideCard({ guide }: { guide: UnblockGuide }) {
  return (
    <section
      className={cn("mt-5 rounded-2xl p-4 sm:p-5", styles.waitingSurface)}
      aria-labelledby="claudia-unblock-title"
    >
      <div className="flex items-start gap-3">
        <UserInputIcon className="mt-0.5 size-5 shrink-0 text-foreground" />
        <div className="min-w-0">
          <h3
            id="claudia-unblock-title"
            className="text-sm font-semibold text-foreground"
          >
            {guide.title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted text-pretty">
            {guide.instruction}
          </p>
          <p className="mt-2 text-xs font-medium leading-5 text-foreground/75 text-pretty">
            {guide.blockingReason}
          </p>
          <div className="mt-4">
            <Link
              href={guide.action.href}
              className={cn(
                buttonVariants({ size: "sm", variant: "primary" }),
                "min-h-11 gap-2 pl-4 pr-3.5 sm:min-h-9",
              )}
            >
              {guide.action.label}
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClaudiaWorkPanel({ state }: { state: AgentState }) {
  const reduceMotion = Boolean(useReducedMotion());
  const halted = isHalted(state);
  const mode: ClaudiaMode = state.presence.isWorking
    ? "working"
    : halted
      ? "halted"
      : "ready";
  const unblockAction = getUnblockAction(state, halted);
  const unblockGuide = getUnblockGuide(state, unblockAction);
  const entries = buildTimeline(state, mode);
  const blockingItem = state.waiting;
  const activeTask = state.now ?? state.next[0] ?? null;
  const headline =
    mode === "halted"
      ? (blockingItem?.title ?? "Claudia needs a quick unblock")
      : (activeTask?.title ?? state.mission.objective);
  const description =
    mode === "halted"
      ? state.presence.reason
      : (state.now?.reason ?? state.presence.reason);
  const statusLabel =
    mode === "working"
      ? "Working now"
      : mode === "halted"
        ? "Waiting for you"
        : state.presence.label;

  return (
    <Card
      className="overflow-hidden rounded-3xl p-2"
      aria-labelledby="claudia-work-title"
    >
      <Card.Content className="grid min-w-0 gap-0 p-0 xl:grid-cols-[minmax(24rem,0.95fr)_minmax(0,1.05fr)]">
        <ClaudiaMedia
          working={mode === "working"}
          reduceMotion={reduceMotion}
          mode={mode}
          statusLabel={statusLabel}
        >
          <Link
            href="/activity"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              styles.mediaControl,
              "min-h-11 gap-2 px-3.5 sm:min-h-9",
            )}
          >
            <ActivityIcon className="size-4" />
            Open work log
          </Link>
          <SteerClaudia
            label="Steer Claudia"
            icon={<AutomationIcon className="size-4" />}
            size="sm"
            variant="outline"
            className={cn(
              styles.mediaControl,
              "min-h-11 gap-2 px-3.5 sm:min-h-9",
            )}
          />
        </ClaudiaMedia>

        <div className="flex min-w-0 flex-col p-5 sm:p-7 xl:p-8">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={mode}
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      filter: "blur(4px)",
                      transform: "translateY(8px)",
                    }
              }
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : {
                      opacity: 1,
                      filter: "blur(0px)",
                      transform: "translateY(0px)",
                    }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      filter: "blur(4px)",
                      transform: "translateY(-8px)",
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0.18, ease: [0.23, 1, 0.32, 1] }
                  : { type: "spring", bounce: 0, duration: 0.3 }
              }
            >
              <h2
                id="claudia-work-title"
                className="type-display max-w-2xl text-3xl text-foreground sm:text-4xl xl:text-[2.75rem]"
              >
                {headline}
              </h2>
              <p className="mt-3 max-w-[60ch] text-sm leading-6 text-muted text-pretty sm:text-base sm:leading-7">
                {description}
              </p>
            </motion.div>
          </AnimatePresence>

          {unblockGuide ? <UnblockGuideCard guide={unblockGuide} /> : null}

          <section
            className="mt-7 min-w-0 flex-1"
            aria-labelledby="claudia-timeline-title"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <AutomationIcon className="size-5 shrink-0 text-muted" />
                <div className="min-w-0">
                  <h3
                    id="claudia-timeline-title"
                    className="text-sm font-semibold text-foreground"
                  >
                    Work timeline
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Latest, now, and what follows
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                {mode === "working" ? (
                  <ExecutionActivity reduceMotion={reduceMotion} />
                ) : null}
                <span className="tabular-nums">Plan v{state.plan.version}</span>
              </div>
            </div>
            <WorkTimeline entries={entries} />
          </section>

          {state.next[0]?.scheduledFor && !state.now ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted">
              <CalendarIcon className="size-4" />
              <span className="tabular-nums">
                Next task{" "}
                {scheduledLabel(state.next[0].scheduledFor, "is scheduled")}
              </span>
            </div>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  );
}
