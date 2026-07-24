"use client";

import { buttonVariants, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ClaudiaOrb } from "@/components/claudia/claudia-orb";
import {
  ArrowRightIcon,
  ArticlesIcon,
  CheckIcon,
  CreditCardIcon,
  PlugIcon,
} from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { OwnerRequestList } from "@/components/inbox/owner-request-list";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { ApiError, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import type {
  ClaudiaHomeStatus,
  ClaudiaHomeView,
} from "@/lib/dashboard/claudia-home-view";
import type { OwnerRequestView } from "@/lib/inbox/owner-request";
import {
  autonomyLabel,
  type AutonomyMode,
} from "@/lib/workspace/settings";
import styles from "./claudia-focus.module.css";

const nextUpdateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const STATUS: Record<ClaudiaHomeStatus, { label: string; className: string }> = {
  working: { label: "Working now", className: "text-accent" },
  on_track: { label: "Ready for you", className: "text-success" },
  waiting_for_user: { label: "Waiting for you", className: "text-warning" },
  paused: { label: "Paused", className: "text-muted" },
  technical_issue: { label: "Technical issue", className: "text-danger" },
};

const EMPTY_OWNER_REQUESTS: OwnerRequestView[] = [];

function nextUpdateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : `Next check ${nextUpdateFormatter.format(date)}`;
}

function primaryActionIcon(href: string) {
  if (href.includes("tab=integrations")) return PlugIcon;
  if (href.includes("tab=billing")) return CreditCardIcon;
  if (href.startsWith("/articles/")) return ArticlesIcon;
  return ArrowRightIcon;
}

export function ClaudiaFocus({
  home,
  ownerRequests = EMPTY_OWNER_REQUESTS,
  autonomyMode,
}: {
  home: ClaudiaHomeView;
  ownerRequests?: OwnerRequestView[];
  autonomyMode: AutonomyMode;
}) {
  const router = useProgressRouter();
  const queryClient = useQueryClient();
  const status = STATUS[home.status];
  const nextUpdate = nextUpdateLabel(home.nextUpdateAt);
  const opportunity = home.contentOpportunity;
  const PrimaryActionIcon = home.primaryAction
    ? primaryActionIcon(home.primaryAction.href)
    : null;
  const createContent = useMutation({
    mutationFn: (topicId: string) =>
      apiPost<{ articleId: string }>("/api/articles/generate", { topicId }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles });
      void queryClient.invalidateQueries({ queryKey: queryKeys.topics });
      router.push(`/articles/${result.articleId}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 402) {
        router.push("/account?tab=billing&upgrade=1");
        return;
      }
      toast.danger(getErrorMessage(error, "Couldn't create this content."));
    },
  });

  return (
    <div className={styles.workspace}>
      <section className={styles.hero} aria-labelledby="claudia-home-title">
        <div className={styles.heroMeta}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className={cn("flex items-center gap-2 text-sm font-medium", status.className)}>
              <span className="relative flex size-2" aria-hidden>
                {home.status === "working" ? (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-30 motion-reduce:animate-none" />
                ) : null}
                <span className="relative inline-flex size-2 rounded-full bg-current" />
              </span>
              {status.label}
            </p>
            {nextUpdate ? <p className="text-xs text-muted tabular-nums">{nextUpdate}</p> : null}
          </div>
          <p className="text-xs text-muted">
            Mode:{" "}
            <span className="font-medium text-accent">{autonomyLabel(autonomyMode)}</span>
            {" · "}
            <Link
              className="font-medium text-accent no-underline hover:underline"
              href="/settings?tab=claudia"
            >
              Change
            </Link>
          </p>
        </div>

        <div className={styles.copy}>
          <h1
            id="claudia-home-title"
            className="type-display mt-7 max-w-[15ch] text-balance text-5xl leading-[1.02] tracking-[-0.035em] text-foreground sm:text-6xl lg:text-7xl"
          >
            {home.headline}
          </h1>
          <p className="mt-6 max-w-[62ch] text-base leading-7 text-muted text-pretty sm:text-lg sm:leading-8">
            {home.explanation}
          </p>

          {home.primaryAction ? (
            <Link
              href={home.primaryAction.href}
              className={cn(
                buttonVariants({ size: "md", variant: "primary" }),
                "mt-8 min-h-11 transition-transform active:scale-[0.96]",
              )}
            >
              {PrimaryActionIcon ? (
                <PrimaryActionIcon className="size-4 shrink-0" aria-hidden />
              ) : null}
              {home.primaryAction.label}
            </Link>
          ) : opportunity ? (
            <LoadingButton
              className="mt-8 min-h-11 transition-transform active:scale-[0.96]"
              isPending={createContent.isPending}
              onPress={() => createContent.mutate(opportunity.id)}
            >
              <ArticlesIcon className="size-4 shrink-0" aria-hidden />
              Create this content
            </LoadingButton>
          ) : null}
        </div>

        <div className={styles.orb} aria-hidden>
          <ClaudiaOrb working={home.status === "working"} />
        </div>
      </section>

      {ownerRequests.length ? (
        <section id="needs-input" className="mx-auto w-full max-w-5xl scroll-mt-24 px-5 py-10" aria-labelledby="needs-input-title">
          <div className="mb-5 max-w-2xl">
            <p className="text-sm font-medium text-warning">Needs your input</p>
            <h2 id="needs-input-title" className="type-display mt-2 text-pretty text-3xl text-foreground sm:text-4xl">
              Claudia has a decision for you
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              These are the only items Claudia cannot safely resolve without you.
            </p>
          </div>
          <OwnerRequestList requests={ownerRequests} />
        </section>
      ) : null}

      <div className={styles.priorities}>
        <section className={styles.priority} aria-labelledby="content-opportunity-title">
          <div className="flex items-center gap-3 text-accent">
            <ArticlesIcon className="size-5" aria-hidden />
            <p className="text-sm font-medium">What to write</p>
          </div>
          {opportunity ? (
            <>
              <h2
                id="content-opportunity-title"
                className="type-display mt-5 max-w-[24ch] text-balance text-3xl leading-[1.08] tracking-[-0.025em] text-foreground sm:text-4xl"
              >
                {opportunity.title}
              </h2>
              <p className="mt-4 max-w-[60ch] text-base leading-7 text-muted text-pretty">
                {opportunity.whyItMatters}
              </p>
              <dl className="mt-7 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted">For</dt>
                  <dd className="mt-1 text-sm leading-6 text-foreground">{opportunity.audience}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Recommended format</dt>
                  <dd className="mt-1 text-sm leading-6 text-foreground">{opportunity.format}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p id="content-opportunity-title" className="mt-5 max-w-xl text-base leading-7 text-muted">
              Claudia is researching the next useful opportunity for your brand.
            </p>
          )}
        </section>

        <section className={styles.priority} aria-labelledby="checklist-priority-title">
          <div className="flex items-center gap-3 text-warning">
            <CheckIcon className="size-5" aria-hidden />
            <p className="text-sm font-medium">What to fix</p>
          </div>
          {home.checklistItem ? (
            <>
              <p className="mt-5 text-xs font-medium uppercase tracking-[0.08em] text-muted">
                {home.checklistItem.pillar} priority
              </p>
              <h2
                id="checklist-priority-title"
                className="type-display mt-3 max-w-[24ch] text-balance text-3xl leading-[1.08] tracking-[-0.025em] text-foreground sm:text-4xl"
              >
                {home.checklistItem.title}
              </h2>
              <p className="mt-4 max-w-[60ch] text-base leading-7 text-muted text-pretty">
                {home.checklistItem.whyItMatters}
              </p>
              <Link
                href={home.checklistItem.href}
                className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground no-underline transition-transform active:scale-[0.96]"
              >
                See the exact fix
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </>
          ) : (
            <p id="checklist-priority-title" className="mt-5 max-w-xl text-base leading-7 text-muted">
              Claudia has not found an open website issue that needs your attention.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
