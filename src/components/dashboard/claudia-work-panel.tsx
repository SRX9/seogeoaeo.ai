"use client";

import { Card, buttonVariants } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";
import { AskClaudia } from "@/components/dashboard/ask-claudia";
import {
  ActivityIcon,
  ArrowRightIcon,
  ArticlesIcon,
  ChartBarIcon,
  CheckIcon,
  ClaudiaIcon,
  UserInputIcon,
} from "@/components/icons";
import { cn } from "@/lib/cn";
import type {
  ClaudiaHomeStatus,
  ClaudiaHomeView,
  ClaudiaRecentContent,
  ClaudiaResultHighlight,
} from "@/lib/dashboard/home-view";

const nextUpdateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const STATUS: Record<
  ClaudiaHomeStatus,
  { label: string; className: string }
> = {
  working: { label: "Working", className: "text-accent" },
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
    : `Next update ${nextUpdateFormatter.format(date)}`;
}

function ClaudiaStatusMedia({ working }: { working: boolean }) {
  return (
    <span
      className="relative block size-24 overflow-hidden rounded-full bg-surface shadow-sm outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
      aria-hidden
    >
      {working ? (
        <video
          autoPlay
          className="absolute inset-0 size-full object-cover"
          loop
          muted
          playsInline
          poster="/web-app-manifest-512x512.png"
          preload="metadata"
        >
          <source src="/claudua_animated.mp4" type="video/mp4" />
        </video>
      ) : (
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="96px"
          src="/web-app-manifest-512x512.png"
        />
      )}
    </span>
  );
}

function ResultCard({ result }: { result: ClaudiaResultHighlight }) {
  return (
    <Link
      href={result.href}
      className="group block min-h-40 rounded-2xl bg-surface-secondary p-5 no-underline outline-none transition-[background-color,transform] focus-visible:ring-2 focus-visible:ring-focus active:scale-[0.96]"
    >
      <span className="text-sm font-medium text-muted">{result.label}</span>
      <strong
        className={cn(
          "mt-3 block text-2xl font-semibold tracking-tight tabular-nums",
          result.tone === "positive" && "text-success",
          result.tone === "attention" && "text-danger",
          result.tone === "neutral" && "text-foreground",
        )}
      >
        {result.value}
      </strong>
      <span className="mt-2 block text-sm leading-6 text-muted group-hover:text-foreground">
        {result.description}
      </span>
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
      className="group flex min-h-20 items-start gap-4 px-5 py-4 no-underline outline-none transition-[background-color,transform] hover-fine:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus active:scale-[0.98] sm:px-6"
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

export function ClaudiaWorkPanel({ home }: { home: ClaudiaHomeView }) {
  const status = STATUS[home.status];
  const nextUpdate = nextUpdateLabel(home.nextUpdateAt);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-3xl p-0" aria-labelledby="claudia-home-title">
        <Card.Content className="grid gap-0 p-0 lg:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="grid min-h-36 place-items-center bg-surface-secondary p-6 lg:min-h-64">
            <ClaudiaStatusMedia working={home.status === "working"} />
          </div>
          <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10">
            <p className={cn("flex items-center gap-2 text-sm font-medium", status.className)}>
              <span className="size-2 rounded-full bg-current" aria-hidden />
              {status.label}
            </p>
            <h2
              id="claudia-home-title"
              className="type-display mt-4 max-w-3xl text-3xl text-foreground text-pretty sm:text-4xl"
            >
              {home.headline}
            </h2>
            <p className="mt-3 max-w-[66ch] text-sm leading-6 text-muted text-pretty sm:text-base sm:leading-7">
              {home.explanation}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
              {home.primaryAction ? (
                <Link
                  href={home.primaryAction.href}
                  className={cn(
                    buttonVariants({ size: "md", variant: "primary" }),
                    "min-h-11 transition-transform active:scale-[0.96]",
                  )}
                >
                  {home.primaryAction.label}
                </Link>
              ) : null}
              {nextUpdate ? (
                <span className="text-sm text-muted tabular-nums">{nextUpdate}</span>
              ) : null}
            </div>
          </div>
        </Card.Content>
      </Card>

      {home.ownerRequest ? (
        <Card className="rounded-3xl p-0" aria-labelledby="owner-request-title">
          <Card.Content className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex min-w-0 items-start gap-4">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning"
                aria-hidden
              >
                <UserInputIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-warning">Needs your input</p>
                <h2
                  id="owner-request-title"
                  className="mt-1 text-xl font-semibold tracking-tight text-foreground"
                >
                  {home.ownerRequest.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground">
                  {home.ownerRequest.recommendation}
                </p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
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
          </Card.Content>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card className="rounded-3xl p-0">
          <Card.Content className="flex h-full flex-col p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <CheckIcon className="size-5 text-success" aria-hidden />
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                This week
              </h2>
            </div>
            <p className="mt-4 flex-1 text-base leading-7 text-foreground text-pretty">
              {home.weeklySummary}
            </p>
            <Link
              href={home.activityHref}
              className="mt-6 flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-accent no-underline transition-transform active:scale-[0.96]"
            >
              <ActivityIcon className="size-4" />
              See activity
            </Link>
          </Card.Content>
        </Card>

        <section aria-labelledby="results-at-a-glance-title">
          <div className="mb-3 flex items-center justify-between gap-4 px-1">
            <div className="flex items-center gap-3">
              <ChartBarIcon className="size-5 text-muted" aria-hidden />
              <h2
                id="results-at-a-glance-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                What changed
              </h2>
            </div>
            <Link href="/visibility" className="inline-flex min-h-11 items-center text-sm font-medium text-muted no-underline hover-fine:text-foreground sm:min-h-10">
              See Results
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {home.resultHighlights.map((result) => (
              <ResultCard key={result.id} result={result} />
            ))}
          </div>
        </section>
      </div>

      <Card className="overflow-hidden rounded-3xl p-0" aria-labelledby="recent-content-title">
        <Card.Header className="flex-row items-center justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <Card.Title id="recent-content-title">Recent content</Card.Title>
            <Card.Description>What Claudia created and where it stands.</Card.Description>
          </div>
          <Link href="/articles" className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-muted no-underline hover-fine:text-foreground sm:min-h-10">
            See Content
          </Link>
        </Card.Header>
        <Card.Content className="divide-y divide-separator p-0">
          {home.recentContent.length > 0 ? (
            home.recentContent.map((content) => (
              <ContentRow key={content.id} content={content} />
            ))
          ) : (
            <div className="px-5 py-8 text-sm leading-6 text-muted sm:px-6">
              Claudia is preparing the first useful content for your brand.
            </div>
          )}
        </Card.Content>
      </Card>

      <Card className="rounded-3xl p-0">
        <Card.Content className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-secondary text-accent"
              aria-hidden
            >
              <ClaudiaIcon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Ask Claudia
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                Ask what she is doing, why she chose it, what improved, or what needs your attention.
              </p>
            </div>
          </div>
          <AskClaudia className="min-h-11 shrink-0 gap-2 transition-transform active:scale-[0.96]" />
        </Card.Content>
      </Card>
    </div>
  );
}
