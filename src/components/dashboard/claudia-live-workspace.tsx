"use client";

import { buttonVariants } from "@heroui/react";
import Link from "next/link";
import { AskClaudia } from "@/components/dashboard/ask-claudia";
import { ClaudiaOrb } from "@/components/claudia/claudia-orb";
import {
  ActivityIcon,
  ArrowRightIcon,
  ArticlesIcon,
  CheckIcon,
  UserInputIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import type {
  ClaudiaHomeStatus,
  ClaudiaHomeView,
  ClaudiaRecentContent,
  ClaudiaResultHighlight,
} from "@/lib/dashboard/home-view";
import styles from "./claudia-work-panel.module.css";

const nextUpdateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const STATUS: Record<ClaudiaHomeStatus, { label: string; className: string }> = {
  working: { label: "Working now", className: "text-accent" },
  on_track: { label: "On track", className: "text-success" },
  waiting_for_user: { label: "Waiting for you", className: "text-warning" },
  paused: { label: "Paused", className: "text-muted" },
  technical_issue: { label: "Technical issue", className: "text-danger" },
};

function nextUpdateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : `Next signal ${nextUpdateFormatter.format(date)}`;
}

function ResultSignal({ result }: { result: ClaudiaResultHighlight }) {
  return (
    <Link
      href={result.href}
      className={styles.signalLink}
      data-tone={result.tone}
    >
      <span className={styles.signalMark} aria-hidden />
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-[0.08em] text-muted">
          {result.label}
        </span>
        <strong className="mt-2 block text-xl font-semibold tracking-tight text-foreground tabular-nums">
          {result.value}
        </strong>
        <span className="mt-1.5 block text-xs leading-5 text-muted">
          {result.description}
        </span>
      </span>
      <ArrowRightIcon className="mt-1 size-4 text-muted" aria-hidden />
    </Link>
  );
}

function contentStatusClass(status: string) {
  if (status === "Published") return "text-success";
  if (status === "Needs review") return "text-warning";
  if (status === "Scheduled") return "text-accent";
  return "text-muted";
}

function ContentRow({ content }: { content: ClaudiaRecentContent }) {
  return (
    <Link
      href={content.href}
      className="group flex min-h-24 items-start gap-4 border-t border-separator py-5 no-underline outline-none transition-[transform,background-color] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus active:scale-[0.98]"
    >
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted"
        aria-hidden
      >
        <ArticlesIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-6 text-foreground">
          {content.title}
        </span>
        <span className="mt-1 block text-sm leading-5 text-muted">
          {content.detail}
        </span>
      </span>
      <span
        className={cn(
          "hidden shrink-0 pt-0.5 text-sm font-medium sm:block",
          contentStatusClass(content.status),
        )}
      >
        {content.status}
      </span>
      <ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

export function ClaudiaLiveWorkspace({ home }: { home: ClaudiaHomeView }) {
  const status = STATUS[home.status];
  const nextUpdate = nextUpdateLabel(home.nextUpdateAt);
  const working = home.status === "working";

  return (
    <div className={styles.workspace}>
      <section
        className={styles.stage}
        data-status={home.status}
        aria-labelledby="claudia-home-title"
      >
        <span className={styles.gridField} aria-hidden />
        <span className={styles.ambient} aria-hidden />
        <span className={styles.ambientSecondary} aria-hidden />

        <div className={styles.status}>
          <p className={cn("flex items-center gap-2 text-sm font-medium", status.className)}>
            <span className="relative flex size-2" aria-hidden>
              {working ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-30 motion-reduce:animate-none" />
              ) : null}
              <span className="relative inline-flex size-2 rounded-full bg-current" />
            </span>
            {status.label}
          </p>
          {nextUpdate ? (
            <p className="mt-2 text-xs text-muted tabular-nums">{nextUpdate}</p>
          ) : null}
        </div>

        <div className={styles.copy}>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Claudia / live workspace
          </p>
          <h2
            id="claudia-home-title"
            className="type-display mt-4 text-4xl text-foreground text-pretty sm:text-5xl"
          >
            {home.headline}
          </h2>
          <p className="mt-4 max-w-[58ch] text-base leading-7 text-muted text-pretty">
            {home.explanation}
          </p>
          {home.primaryAction ? (
            <Link
              href={home.primaryAction.href}
              className={cn(
                buttonVariants({ size: "md", variant: "primary" }),
                "mt-7 min-h-11 transition-transform active:scale-[0.96]",
              )}
            >
              {home.primaryAction.label}
            </Link>
          ) : null}
        </div>

        <div className={styles.orb}>
          <span className={styles.orbitTrack} aria-hidden />
          <ClaudiaOrb working={working} />
        </div>

        <aside className={styles.signals} aria-label="Live growth signals">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Live signals
          </p>
          {home.resultHighlights.map((result) => (
            <ResultSignal key={result.id} result={result} />
          ))}
        </aside>

        <div className={styles.week}>
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckIcon className="size-4" aria-hidden />
            This week
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground text-pretty">
            {home.weeklySummary}
          </p>
          <Link
            href={home.activityHref}
            className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-accent no-underline transition-transform active:scale-[0.96]"
          >
            <ActivityIcon className="size-4" />
            See activity
          </Link>
        </div>

        <div className={styles.ask}>
          <p className="mb-3 text-xs font-medium text-muted">Want the reasoning behind a signal?</p>
          <AskClaudia className="min-h-11 gap-2 transition-transform active:scale-[0.96]" />
        </div>
      </section>

      {home.ownerRequest ? (
        <section className={styles.ownerRequest} aria-labelledby="owner-request-title">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning"
              aria-hidden
            >
              <UserInputIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-warning">Needs your input</p>
              <h2
                id="owner-request-title"
                className="mt-1 text-2xl font-semibold tracking-tight text-foreground"
              >
                {home.ownerRequest.title}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-foreground">
                {home.ownerRequest.recommendation}
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                {home.ownerRequest.reason}
              </p>
            </div>
          </div>
          <Link
            href={home.ownerRequest.action.href}
            className={cn(
              buttonVariants({ size: "md", variant: "primary" }),
              "min-h-11 shrink-0 gap-2 transition-transform active:scale-[0.96]",
            )}
          >
            {home.ownerRequest.action.label}
            <ArrowRightIcon className="size-4" />
          </Link>
        </section>
      ) : null}

      <section className={styles.content} aria-labelledby="recent-content-title">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Output stream
          </p>
          <h2
            id="recent-content-title"
            className="type-display mt-3 text-3xl text-foreground sm:text-4xl"
          >
            Recent content
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
            What Claudia created, where it stands, and what she is watching next.
          </p>
          <Link
            href="/articles"
            className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-accent no-underline transition-transform active:scale-[0.96]"
          >
            See all content
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <div>
          {home.recentContent.length > 0 ? (
            home.recentContent.map((content) => (
              <ContentRow key={content.id} content={content} />
            ))
          ) : (
            <p className="border-y border-separator py-8 text-sm leading-6 text-muted">
              Claudia is preparing the first useful content for your brand.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

