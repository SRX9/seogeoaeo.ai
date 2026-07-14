"use client";

import {
  AlertDialog,
  Button,
  Card,
  Switch,
  toast,
  useOverlayState,
} from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import {
  ArticlesIcon,
  BoltIcon,
  CalendarIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClaudiaIcon,
  GlobeIcon,
  InlineCodeIcon,
  OverviewIcon,
  ShieldIcon,
  AutomationIcon,
  TrendingUpIcon,
  WorkshopIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  type AgentActionView,
  type AutonomyCategoryState,
  useAgentActions,
  useAgentState,
  useAutomation,
  useBrandAutonomy,
  useMe,
} from "@/lib/api/queries";
import type { SteeringResult } from "@/lib/agent/types";

type AutonomyMode = "FULL_AUTO" | "REVIEW";
type AutonomyLevel = 0 | 1 | 2;

const AUTHORITY_POINTS = [
  { icon: CircleCheckIcon, label: "Publishes approved content" },
  { icon: WorkshopIcon, label: "Prepares site fixes" },
  { icon: GlobeIcon, label: "Never changes off-site profiles" },
  { icon: ArticlesIcon, label: "Logs every action" },
] as const;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  meta_tags: "Optimize titles and descriptions.",
  schema: "Add and update schema markup.",
  llms_txt: "Keep your AI site guide accurate.",
  crawler_access: "Protect access for search and AI crawlers.",
  answer_share: "Improve content for AI discovery.",
  performance: "Prepare safe speed improvements.",
  search_ctr: "Improve pages that earn impressions but few clicks.",
};

const CATEGORY_ICONS = {
  meta_tags: ArticlesIcon,
  schema: OverviewIcon,
  llms_txt: InlineCodeIcon,
  crawler_access: GlobeIcon,
  answer_share: ClaudiaIcon,
  performance: BoltIcon,
  search_ctr: TrendingUpIcon,
} as const;

const LEVEL_LABELS: Record<AutonomyLevel, string> = {
  0: "Watch",
  1: "Active",
  2: "High",
};

const ACTION_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ModeSelector({ brandId, currentMode }: { brandId: string; currentMode: string }) {
  const [mode, setMode] = useState<AutonomyMode>(
    currentMode === "FULL_AUTO" ? "FULL_AUTO" : "REVIEW",
  );
  const confirm = useOverlayState();
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (autonomyMode: AutonomyMode) =>
      apiPatch("/api/brand/settings", { brandId, autonomyMode }),
    onSuccess: (_data, autonomyMode) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      void queryClient.invalidateQueries({ queryKey: queryKeys.brandAutonomy });
      toast.success(
        autonomyMode === "FULL_AUTO"
          ? "Autopilot is on. Claudia can complete approved work."
          : "Copilot is on. Claudia will suggest work for your review.",
      );
    },
    onError: (error, autonomyMode) => {
      setMode(autonomyMode === "FULL_AUTO" ? "REVIEW" : "FULL_AUTO");
      toast.danger(getErrorMessage(error, "Could not update Claudia's mode"));
    },
  });

  function apply(nextMode: AutonomyMode) {
    if (nextMode === mode || update.isPending) return;
    setMode(nextMode);
    update.mutate(nextMode);
  }

  return (
    <>
      <Card>
        <Card.Header>
          <Card.Title>Working Mode</Card.Title>
          <Card.Description>Choose how much review Claudia needs before acting.</Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-3 sm:grid-cols-2">
          <Button
            variant={mode === "FULL_AUTO" ? "secondary" : "outline"}
            className="h-auto min-h-28 justify-start gap-4 whitespace-normal p-5 text-left"
            aria-pressed={mode === "FULL_AUTO"}
            isDisabled={update.isPending}
            onPress={() => {
              if (mode !== "FULL_AUTO") confirm.open();
            }}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-accent" aria-hidden>
              <AutomationIcon className="size-4" />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm font-semibold text-foreground">Autopilot</strong>
              <span className="mt-1 block text-xs leading-5 text-muted">Complete approved work within your guardrails.</span>
            </span>
          </Button>
          <Button
            variant={mode === "REVIEW" ? "secondary" : "outline"}
            className="h-auto min-h-28 justify-start gap-4 whitespace-normal p-5 text-left"
            aria-pressed={mode === "REVIEW"}
            isDisabled={update.isPending}
            onPress={() => apply("REVIEW")}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-accent" aria-hidden>
              <ClaudiaIcon className="size-4" />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm font-semibold text-foreground">Copilot</strong>
              <span className="mt-1 block text-xs leading-5 text-muted">Suggest work and wait for your approval.</span>
            </span>
          </Button>
        </Card.Content>
      </Card>

      <AlertDialog.Backdrop isOpen={confirm.isOpen} onOpenChange={confirm.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Turn on Autopilot?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                Claudia will publish approved articles and prepare ready-to-install site fixes
                within the guardrails below. Every action remains logged.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Cancel</Button>
              <Button slot="close" onPress={() => apply("FULL_AUTO")}>Enable Autopilot</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}

function AuthorityCard() {
  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Authority Guardrails</Card.Title>
        <Card.Description>Claudia grows visibility without crossing these boundaries.</Card.Description>
      </Card.Header>
      <Card.Content className="grid gap-3 sm:grid-cols-2">
        {AUTHORITY_POINTS.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-background p-3 text-sm text-foreground">
            <Icon className="size-4 shrink-0 text-muted" aria-hidden />
            <span>{label}</span>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}

function CategoryRow({ brandId, row }: { brandId: string; row: AutonomyCategoryState }) {
  const queryClient = useQueryClient();
  const level = row.level as AutonomyLevel;
  const Icon = CATEGORY_ICONS[row.category as keyof typeof CATEGORY_ICONS] ?? ShieldIcon;
  const update = useMutation({
    mutationFn: (nextLevel: AutonomyLevel) =>
      apiPatch("/api/brand/autonomy", {
        brandId,
        category: row.category,
        level: nextLevel,
      }),
    onSuccess: (_data, nextLevel) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.brandAutonomy });
      toast.success(
        nextLevel === 0 ? `${row.label} is now watch-only.` : `${row.label} is active.`,
      );
    },
    onError: (error) =>
      toast.danger(getErrorMessage(error, "Could not update this autonomy setting")),
  });

  return (
    <div className="grid gap-3 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <span className="hidden size-9 place-items-center rounded-xl bg-surface-secondary text-muted sm:grid" aria-hidden>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{row.label}</p>
          <ToneText tone={level > 0 ? "success" : "default"} className="text-xs">
            {LEVEL_LABELS[level]}
          </ToneText>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted">
          {CATEGORY_DESCRIPTIONS[row.category] ?? "Monitor and prepare safe improvements."}
        </p>
        <p className="mt-1 text-xs text-muted">
          {row.verifiedLastCycle > 0
            ? `${row.verifiedLastCycle} verified last cycle`
            : level === 0
              ? "Watching only"
              : "Guardrails applied"}
        </p>
      </div>
      <Switch
        aria-label={`${row.label} autonomous preparation`}
        isSelected={level > 0}
        isDisabled={update.isPending}
        onChange={(selected) => update.mutate(selected ? 1 : 0)}
      >
        <Switch.Content>
          <Switch.Control><Switch.Thumb /></Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  );
}

function AutonomyMatrix({ brandId }: { brandId: string }) {
  const autonomy = useBrandAutonomy(brandId);
  const [showAll, setShowAll] = useState(false);

  return (
    <Section query={autonomy} skeleton={<CardSkeleton lines={5} />} errorLabel="Couldn't load Claudia's autonomy settings.">
      {(data) => {
        const visibleRows = showAll ? data.categories : data.categories.slice(0, 5);
        return (
          <Card className="overflow-hidden p-0">
            <Card.Header className="px-5 pt-5 sm:px-6 sm:pt-6">
              <Card.Title>Autonomy by Capability</Card.Title>
              <Card.Description>Control where Claudia can prepare and complete work.</Card.Description>
            </Card.Header>
            <Card.Content className="divide-y divide-separator p-0">
              {visibleRows.map((row) => <CategoryRow key={row.category} brandId={brandId} row={row} />)}
            </Card.Content>
            {data.categories.length > 5 ? (
              <Card.Footer className="px-5 pb-5 sm:px-6 sm:pb-6">
                <Button size="sm" variant="ghost" onPress={() => setShowAll((current) => !current)}>
                  {showAll ? "Show fewer" : `Show all ${data.categories.length}`}
                </Button>
              </Card.Footer>
            ) : null}
          </Card>
        );
      }}
    </Section>
  );
}

function ScheduleCard({ monthlyCredits }: { monthlyCredits: number | null }) {
  const agentState = useAgentState();
  const automation = useAutomation();
  const queryClient = useQueryClient();
  const confirmPause = useOverlayState();
  const ownerPaused = agentState.data?.presence.id === "paused" && agentState.data.presence.reason.toLowerCase().includes("owner");
  const systemPaused = agentState.data?.presence.id === "paused" && !ownerPaused;
  const steer = useMutation({
    mutationFn: (message: string) => apiPost<SteeringResult>("/api/agent/steer", { message }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      toast.success(result.title);
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not update the schedule")),
  });

  const dailyCap = automation.data?.dailyCap ?? 0;
  const rows = [
    {
      title: "Daily Work",
      description: "Research, writing, and monitoring",
      value: automation.data?.schedule?.split("·")[0]?.trim() || "Every day",
      detail: "08:00 UTC",
    },
    { title: "Weekly Audits", description: "Comprehensive site audit", value: "Mondays", detail: "09:00 UTC" },
    {
      title: "Monthly Cap",
      description: "Volume and risk controls",
      value: monthlyCredits ? `${monthlyCredits.toLocaleString()} credits` : "Plan limits",
      detail: dailyCap > 0 ? `${dailyCap} article${dailyCap === 1 ? "" : "s"} per day` : "Always enforced",
    },
  ];

  function changePause() {
    if (ownerPaused) {
      steer.mutate("Resume all automation.");
      return;
    }
    confirmPause.open();
  }

  return (
    <>
      <Card>
        <Card.Header className="flex-row items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
            <CalendarIcon className="size-4" />
          </span>
          <div>
            <Card.Title>Schedule</Card.Title>
            <Card.Description>When Claudia runs recurring work.</Card.Description>
          </div>
        </Card.Header>
        <Card.Content className="divide-y divide-separator">
          {rows.map(({ title, description, value, detail }) => (
            <div key={title} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted">{description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-foreground tabular-nums">{value}</p>
                <p className="mt-1 text-xs text-muted tabular-nums">{detail}</p>
              </div>
            </div>
          ))}
        </Card.Content>
        <Card.Footer>
          <Button
            fullWidth
            variant="outline"
            isPending={steer.isPending}
            isDisabled={systemPaused || agentState.data === undefined}
            onPress={changePause}
          >
            {systemPaused ? "Automation paused" : ownerPaused ? "Resume automation" : "Pause automation"}
          </Button>
        </Card.Footer>
      </Card>

      <AlertDialog.Backdrop isOpen={confirmPause.isOpen} onOpenChange={confirmPause.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[420px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Pause Claudia for 7 days?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p>
                Claudia will stop starting new autonomous work. Completed work and your saved
                schedule stay unchanged, and you can resume early.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Cancel</Button>
              <Button slot="close" variant="secondary" onPress={() => steer.mutate("Pause all automation for 7 days.")}>Pause automation</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}

function actionSummary(action: AgentActionView) {
  return {
    title: titleCase(action.actionType),
    description: action.resourceRef || titleCase(action.verificationStatus),
  };
}

function RecentDecisions() {
  const actions = useAgentActions();

  return (
    <Section query={actions} skeleton={<CardSkeleton lines={5} />} errorLabel="Couldn't load recent authority decisions.">
      {(data) => (
        <Card>
          <Card.Header>
            <Card.Title>Recent Decisions</Card.Title>
            <Card.Description>Latest actions taken within your authority settings.</Card.Description>
          </Card.Header>
          {data.actions.length > 0 ? (
            <Card.Content className="divide-y divide-separator">
              {data.actions.slice(0, 5).map((action) => {
                const summary = actionSummary(action);
                return (
                  <div key={action.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{summary.title}</p>
                      <ToneText className="text-xs">{titleCase(action.capability)}</ToneText>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{summary.description}</p>
                    <time className="mt-1 block text-xs text-muted tabular-nums" dateTime={action.createdAt}>
                      {ACTION_DATE_FORMATTER.format(new Date(action.createdAt))}
                    </time>
                  </div>
                );
              })}
            </Card.Content>
          ) : (
            <Card.Content>
              <EmptyState>
                <EmptyState.Header>
                  <EmptyState.Media variant="icon"><ShieldIcon /></EmptyState.Media>
                  <EmptyState.Title>No Decisions Yet</EmptyState.Title>
                  <EmptyState.Description>Logged authority decisions will appear here.</EmptyState.Description>
                </EmptyState.Header>
              </EmptyState>
            </Card.Content>
          )}
          <Card.Footer>
            <Link href="/activity" className="inline-flex items-center gap-1 text-sm font-medium text-link no-underline">
              View all activity <ChevronRightIcon className="size-4" />
            </Link>
          </Card.Footer>
        </Card>
      )}
    </Section>
  );
}

export function AutomationSection() {
  const me = useMe();

  return (
    <Section query={me} skeleton={<CardSkeleton lines={8} className="min-h-[600px]" />} errorLabel="Couldn't load automation settings.">
      {(data) => {
        const activeBrand = data.brands.find((brand) => brand.id === data.activeBrandId) ?? data.brands[0] ?? null;

        if (!activeBrand) {
          return (
            <Card>
              <Card.Content>
                <EmptyState>
                  <EmptyState.Header>
                    <EmptyState.Media variant="icon"><ClaudiaIcon /></EmptyState.Media>
                    <EmptyState.Title>No Brand Selected</EmptyState.Title>
                    <EmptyState.Description>Select a brand to configure Claudia&apos;s authority.</EmptyState.Description>
                  </EmptyState.Header>
                </EmptyState>
              </Card.Content>
            </Card>
          );
        }

        return (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
            <div className="space-y-6">
              <ModeSelector key={`mode-${activeBrand.id}`} brandId={activeBrand.id} currentMode={activeBrand.autonomyMode} />
              <AuthorityCard />
              <AutonomyMatrix key={`matrix-${activeBrand.id}`} brandId={activeBrand.id} />
            </div>
            <aside className="space-y-6">
              <ScheduleCard monthlyCredits={data.subscription?.monthlyCreditGrant ?? null} />
              <RecentDecisions />
            </aside>
          </div>
        );
      }}
    </Section>
  );
}
