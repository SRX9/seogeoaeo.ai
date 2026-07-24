"use client";

import { Card, Link as HeroLink, Skeleton, Tabs } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import type { ComponentType, SVGProps } from "react";
import {
  ActivityIcon,
  ArrowRightIcon,
  ArticlesIcon,
  CircleCheckIcon,
  GaugeIcon,
  GlobeIcon,
  QuoteIcon,
  RefreshIcon,
  SearchIcon,
  InsightIcon,
  WorkshopIcon,
} from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { ToneText } from "@/components/ui/status-text";
import { PageHeader } from "@/components/layout/page-header";
import { useToolLatestRuns } from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { TOOLBOX_META, type ToolboxMeta } from "@/lib/visibility/toolbox-meta";

type PillarKey = "geo" | "aeo" | "seo";
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const PILLARS: Array<{ id: PillarKey; label: string; description: string }> = [
  { id: "geo", label: "GEO", description: "Generative-engine discovery and access" },
  { id: "aeo", label: "AEO", description: "Answer quality and citability signals" },
  { id: "seo", label: "SEO", description: "Technical and on-page search checks" },
];

const TOOL_ICONS: Record<string, IconType> = {
  "crawler-access": GlobeIcon,
  "content-signals": ActivityIcon,
  "llms-txt": ArticlesIcon,
  "meta-audit": SearchIcon,
  citability: QuoteIcon,
  "technical-seo": GaugeIcon,
  "schema-audit": CircleCheckIcon,
  "schema-generator": InsightIcon,
};

type LatestRun = { score: number | null; createdAt: string } | undefined;

function scoreTone(score: number | null | undefined) {
  if (score == null) return "default" as const;
  if (score >= 70) return "success" as const;
  if (score >= 40) return "warning" as const;
  return "danger" as const;
}

function ToolCard({
  tool,
  run,
  loading,
  unavailable,
}: {
  tool: ToolboxMeta;
  run: LatestRun;
  loading: boolean;
  unavailable: boolean;
}) {
  const Icon = TOOL_ICONS[tool.slug] ?? GaugeIcon;
  const score = run?.score == null ? null : Math.round(run.score);

  return (
    <HeroLink href={`/tools/${tool.slug}`} className="group block h-full no-underline">
      <Card className="h-full transition-colors group-hover:bg-surface-secondary">
        <Card.Header className="flex-row items-start gap-3 p-5 pb-3">
          <span className="flex size-10 shrink-0 items-center justify-center text-muted">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <Card.Title className="text-base">{tool.name}</Card.Title>
            <Card.Description className="mt-1 line-clamp-2 leading-5">
              {tool.description}
            </Card.Description>
          </div>
          <ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted" aria-hidden />
        </Card.Header>
        <Card.Footer className="flex-wrap items-center justify-between gap-2 px-5 pb-5 pt-2">
          <span className="text-xs text-muted tabular-nums">
            {CREDIT_COSTS[tool.costKey].toLocaleString()} credits per run
          </span>
          {loading ? (
            <Skeleton className="h-5 w-24 rounded-lg" />
          ) : unavailable ? (
            <ToneText tone="warning" className="text-xs">Score Unavailable</ToneText>
          ) : (
            <ToneText tone={scoreTone(score)} className="text-xs tabular-nums">
              {score == null ? "Not run" : `Score ${score}`}
            </ToneText>
          )}
        </Card.Footer>
      </Card>
    </HeroLink>
  );
}

export function ExtraToolsExplorer() {
  const latestRuns = useToolLatestRuns();
  const latest = latestRuns.data?.latest ?? {};
  const scoresUnavailable = latestRuns.isError && !latestRuns.data;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Extra Tools"
        description="Run focused GEO, AEO, and SEO checks without changing your ongoing Claudia plan."
        meta={
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <WorkshopIcon className="size-3.5" aria-hidden />
            {TOOLBOX_META.length} analyzers
          </span>
        }
      />

      {scoresUnavailable ? (
        <Card>
          <EmptyState>
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <RefreshIcon className="size-5" aria-hidden />
              </EmptyState.Media>
              <EmptyState.Title>{"Couldn't Load Recent Tool Runs"}</EmptyState.Title>
              <EmptyState.Description className="max-w-md text-pretty">
                The analyzer catalog is still available, but recent scores could not be loaded. Try the request again.
              </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
              <LoadingButton
                variant="outline"
                isPending={latestRuns.isFetching}
                onPress={() => void latestRuns.refetch()}
              >
                Try again
              </LoadingButton>
            </EmptyState.Content>
          </EmptyState>
        </Card>
      ) : null}

      <Tabs defaultSelectedKey="geo" className="w-full">
        <Tabs.ListContainer className="w-fit max-w-full">
          <Tabs.List aria-label="Tool category">
            {PILLARS.map((pillar) => (
              <Tabs.Tab key={pillar.id} id={pillar.id}>
                {pillar.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>

        {PILLARS.map((pillar) => {
          const tools = TOOLBOX_META.filter((tool) => tool.pillar === pillar.id);
          return (
            <Tabs.Panel key={pillar.id} id={pillar.id} className="pt-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight">{pillar.label} analyzers</h2>
                <p className="mt-1 text-sm leading-6 text-muted">{pillar.description}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {tools.map((tool) => (
                  <ToolCard
                    key={tool.slug}
                    tool={tool}
                    run={latest[tool.slug]}
                    loading={latestRuns.isLoading}
                    unavailable={scoresUnavailable}
                  />
                ))}
              </div>
            </Tabs.Panel>
          );
        })}
      </Tabs>
    </main>
  );
}
