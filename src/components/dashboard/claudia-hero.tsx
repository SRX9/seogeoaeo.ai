"use client";

import { Button, Card, ProgressBar, buttonVariants } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AgentPlan } from "@/components/dashboard/agent-plan";
import { SteerClaudia } from "@/components/dashboard/steer-claudia";
import {
  CheckIcon,
  MinusIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  InsightIcon,
  XIcon,
} from "@/components/icons";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { ToneText } from "@/components/ui/status-text";
import { apiPost } from "@/lib/api/fetcher";
import {
  queryKeys,
  useMe,
  type IntegrationView,
  type SetupRunResponse,
  type SetupStep,
} from "@/lib/api/queries";
import type { AgentState } from "@/lib/agent/types";
import { isActiveSubscription } from "@/lib/billing/plans";
import { cn } from "@/lib/cn";

const SETUP_COPY: Record<string, { title: string; description: string }> = {
  first_audit: { title: "First Audit", description: "Site, indexation, and technical baseline" },
  seed_prompts: { title: "Buyer Questions", description: "Map the questions your buyers ask" },
  answer_check: { title: "AI Answer Check", description: "Find where AI answers pull from today" },
  competitor_baseline: { title: "Competitor Baseline", description: "See who ranks and what they cover" },
  topic_research: { title: "Topic Research", description: "Find high-intent topics and gaps" },
  quick_win_fixes: { title: "Quick Wins", description: "Prepare titles, FAQs, and schema" },
  first_article: { title: "First Article", description: "Draft your cornerstone article" },
  day0_brief: { title: "Baseline Brief", description: "Summarize the baseline and plan" },
};

function SetupStepIcon({ status, index }: { status: SetupStep["status"]; index: number }) {
  if (status === "done") return <CheckIcon className="size-4" />;
  if (status === "skipped") return <MinusIcon className="size-4" />;
  if (status === "failed") return <XIcon className="size-4" />;
  if (status === "running") {
    return <span className="size-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none" />;
  }
  return <span className="text-xs tabular-nums">{index + 1}</span>;
}

function statusLabel(status: SetupStep["status"]) {
  if (status === "done") return "Complete";
  if (status === "running") return "Running";
  if (status === "failed") return "Stopped";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

function statusTone(status: SetupStep["status"]): "success" | "warning" | "danger" | "default" {
  if (status === "done") return "success";
  if (status === "running") return "warning";
  if (status === "failed") return "danger";
  return "default";
}

function setupTitle(step: SetupStep, labels: Record<string, string>) {
  return SETUP_COPY[step.key]?.title ?? labels[step.key] ?? step.key;
}

function SetupChecklist({ steps, labels }: { steps: SetupStep[]; labels: Record<string, string> }) {
  return (
    <ol className="grid gap-3 lg:grid-cols-2" aria-live="polite">
      {steps.map((step, index) => (
        <li
          key={step.key}
          className={cn(
            "flex min-w-0 items-start gap-3 rounded-2xl bg-surface-secondary/80 p-4",
            step.status === "running" && "ring-1 ring-accent/20",
          )}
        >
          <span
            className={cn(
              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-background text-muted",
              step.status === "done" && "text-success",
              step.status === "failed" && "text-danger",
              step.status === "running" && "text-accent",
            )}
            aria-hidden
          >
            <SetupStepIcon status={step.status} index={index} />
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-semibold leading-5 text-foreground">
              {setupTitle(step, labels)}
            </strong>
            <small className="mt-1 block line-clamp-2 text-xs leading-5 text-muted text-pretty">
              {SETUP_COPY[step.key]?.description ?? step.note ?? labels[step.key]}
            </small>
          </span>
          <ToneText tone={statusTone(step.status)} className="shrink-0 text-xs">
            {statusLabel(step.status)}
          </ToneText>
        </li>
      ))}
    </ol>
  );
}

function OptionalConnections({ integrations }: { integrations: IntegrationView[] }) {
  const cmsConnected = integrations.some(
    (integration) => integration.enabled && ["wordpress", "ghost", "webhook"].includes(integration.provider),
  );

  return (
    <Card className="h-fit p-5 sm:p-6">
      <Card.Header>
        <Card.Title className="text-lg font-semibold tracking-[-0.015em]">
          Optional connections
        </Card.Title>
        <Card.Description className="mt-1 leading-5 text-pretty">
          Connect more data when you are ready.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-3.5">
        <div className="flex items-start gap-3 rounded-2xl bg-surface-secondary p-4">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-accent"
            aria-hidden
          >
            <SearchIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Search Console</p>
            <p className="mt-1 text-xs leading-5 text-muted text-pretty">
              Query, click, and impression data.
            </p>
          </div>
          <Link
            href="/settings?tab=integrations"
            className="-my-2 inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-accent no-underline transition-colors duration-150 hover-fine:text-foreground"
          >
            Connect
          </Link>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-surface-secondary p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-muted" aria-hidden>
            <SettingsIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Publishing</p>
            <p className="mt-1 text-xs leading-5 text-muted text-pretty">
              Review and publish content from your CMS.
            </p>
          </div>
          <Link
            href="/settings?tab=integrations"
            className="-my-2 inline-flex min-h-10 shrink-0 items-center text-sm font-medium text-accent no-underline transition-colors duration-150 hover-fine:text-foreground"
          >
            {cmsConnected ? "Review" : "Connect"}
          </Link>
        </div>
      </Card.Content>
      <Card.Footer className="flex items-start gap-2 border-t border-separator/70 pt-4 text-xs leading-5 text-muted">
        <ShieldIcon className="size-4" aria-hidden />
        Connections are secure and read only.
      </Card.Footer>
    </Card>
  );
}

function SetupDashboard({
  setup,
  integrations,
  isPending,
  subscribed,
  onStart,
}: {
  setup: SetupRunResponse;
  integrations: IntegrationView[];
  isPending: boolean;
  subscribed: boolean;
  onStart: () => void;
}) {
  const run = setup.run;
  const failed = run?.status === "failed";
  const steps = run?.steps ?? Object.keys(setup.labels).map((key) => ({ key, status: "pending" as const }));
  const done = steps.filter((step) => step.status === "done" || step.status === "skipped").length;
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;

  return (
    <section className="space-y-8" aria-labelledby="setup-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <ToneText
            tone={failed ? "danger" : run ? "warning" : "accent"}
            className="text-xs"
          >
            {failed ? "Needs attention" : run ? "Setup running" : "Ready to start"}
          </ToneText>
          <h1
            id="setup-title"
            className="type-display mt-3 text-3xl text-foreground sm:text-4xl"
          >
            Build your operating baseline
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted text-pretty">
            Claudia maps your site, competitors, buyer questions, and first growth opportunities.
          </p>
        </div>
        {!run ? (
          subscribed ? (
            <Button className="min-h-11" isPending={isPending} onPress={onStart}>
              {isPending ? "Starting…" : "Start setup"}
            </Button>
          ) : (
            <Link href="/account?tab=billing" className={cn(buttonVariants(), "min-h-11")}>
              Choose a plan
            </Link>
          )
        ) : null}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-6">
        <Card className="min-w-0 p-5 sm:p-6">
          <Card.Header className="flex-row items-start justify-between gap-4">
            <div className="min-w-0">
              <Card.Title className="text-lg font-semibold tracking-[-0.015em]">
                Setup progress
              </Card.Title>
              <Card.Description className="mt-1 leading-5 text-pretty">
                {failed ? "Completed work is saved. Resume from the first unfinished step." : "You can leave this page while the workflow continues."}
              </Card.Description>
            </div>
            <span className="shrink-0 pt-0.5 text-sm font-medium tabular-nums text-foreground">
              {done} of {steps.length}
            </span>
          </Card.Header>
          <Card.Content className="space-y-6">
            <ProgressBar aria-label="Setup progress" value={percent}>
              <ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track>
            </ProgressBar>
            <SetupChecklist steps={steps} labels={setup.labels} />
          </Card.Content>
          {failed ? (
            <Card.Footer className="border-t border-separator/70 pt-4">
              <Button
                className="min-h-11 sm:min-h-9"
                variant="secondary"
                isPending={isPending}
                onPress={onStart}
              >
                Resume setup
              </Button>
            </Card.Footer>
          ) : null}
        </Card>
        <OptionalConnections integrations={integrations} />
      </div>
    </section>
  );
}

function LiveDashboard({ agent }: { agent: AgentState }) {
  const activeTask = agent.now ?? agent.next[0] ?? null;
  const headline = activeTask?.title ?? agent.waiting?.title ?? agent.mission.objective;
  const context = activeTask?.reason ?? agent.waiting?.blockedValue ?? agent.presence.reason;
  const summary = activeTask ? agent.mission.objective : agent.presence.reason;
  const needsAttention = agent.presence.id === "needs_attention";

  return (
    <section className="space-y-8" aria-labelledby="dashboard-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ToneText tone={needsAttention ? "warning" : "success"}>{agent.presence.label}</ToneText>
            <span className="text-xs text-muted tabular-nums">Plan v{agent.plan.version}</span>
          </div>
          <h1
            id="dashboard-title"
            className="type-display mt-3 text-3xl text-foreground sm:text-4xl"
          >
            Dashboard
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted text-pretty">
            Your current priority, work queue, and measurable progress.
          </p>
        </div>
        <SteerClaudia label="Steer Claudia" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card className="min-w-0 p-5 sm:p-6">
          <Card.Header>
            <div className="flex items-center gap-2 text-sm font-medium text-muted">
              <InsightIcon className="size-4 text-accent" aria-hidden />
              Current priority
            </div>
            <Card.Title className="mt-3 max-w-3xl text-2xl font-semibold leading-tight tracking-[-0.025em] text-balance sm:text-3xl">
              {headline}
            </Card.Title>
            <Card.Description className="mt-1 max-w-[65ch] text-sm leading-6 text-pretty">
              {context}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="rounded-2xl bg-surface-secondary p-4">
              <p className="text-xs font-medium text-muted">Mission</p>
              <p className="mt-1.5 text-sm leading-6 text-foreground text-pretty">
                {summary}
              </p>
            </div>
          </Card.Content>
          {agent.waiting ? (
            <Card.Footer className="border-t border-separator/70 pt-4">
              <Link
                href={agent.waiting.href}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "min-h-11 text-warning",
                )}
              >
                Review required decision
              </Link>
            </Card.Footer>
          ) : null}
        </Card>
        <AgentPlan state={agent} />
      </div>
    </section>
  );
}

export function ClaudiaHero({
  setup,
  agent,
  integrations = [],
}: {
  setup: SetupRunResponse;
  agent: AgentState;
  integrations?: IntegrationView[];
}) {
  const queryClient = useQueryClient();
  const me = useMe();
  const start = useMutation({
    mutationFn: () => apiPost("/api/setup-run", {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.setupRun });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
    },
  });

  if (me.isLoading) {
    return <CardSkeleton lines={5} className="min-h-96" />;
  }

  if (setup.run?.status !== "completed") {
    return (
      <SetupDashboard
        setup={setup}
        integrations={integrations}
        isPending={start.isPending}
        subscribed={isActiveSubscription(me.data?.subscription?.status)}
        onStart={() => start.mutate()}
      />
    );
  }

  return <LiveDashboard agent={agent} />;
}
