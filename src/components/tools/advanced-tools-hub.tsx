"use client";

import { buttonVariants } from "@heroui/react/button";
import { Accordion, Card, Link as HeroLink } from "@heroui/react";
import type { ComponentType, SVGProps } from "react";
import {
  ActivityIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArticlesIcon,
  BulletListIcon,
  CalendarIcon,
  ChevronRightIcon,
  GaugeIcon,
  LayersIcon,
  WorkshopIcon,
} from "@/components/icons";
import { PageHeader } from "@/components/layout/page-header";
import {
  useActivity,
  useToolLatestRuns,
  useTopics,
  useVisibilitySummary,
} from "@/lib/api/queries";

type ToolCard = {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const ADVANCED_CONTROLS = [
  {
    href: "/articles",
    title: "Article Library",
    description: "Review every draft and published article.",
    icon: ArticlesIcon,
  },
  {
    href: "/visibility/fixes",
    title: "Fix Queue",
    description: "Inspect and action technical visibility findings.",
    icon: ActivityIcon,
  },
  {
    href: "/visibility/health",
    title: "Site Health",
    description: "Open the detailed technical health checklist.",
    icon: GaugeIcon,
  },
  {
    href: "/visibility/answers",
    title: "AI Answers",
    description: "See where assistants mention your brand.",
    icon: WorkshopIcon,
  },
] as const;

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function AdvancedToolCard({ href, title, description, eyebrow, icon: Icon }: ToolCard) {
  return (
    <HeroLink href={href} className="group block h-full no-underline">
      <Card className="h-full transition-colors group-hover:bg-surface-secondary">
        <Card.Header className="flex-row items-start justify-between gap-4 p-5 sm:p-6">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-muted">
            <Icon className="size-5" aria-hidden />
          </span>
          <ArrowRightIcon className="size-4 shrink-0 text-muted" aria-hidden />
        </Card.Header>
        <Card.Content className="px-5 pb-5 sm:px-6 sm:pb-6">
          <p className="text-xs font-medium text-muted">{eyebrow}</p>
          <h2 className="mt-2 text-base font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        </Card.Content>
      </Card>
    </HeroLink>
  );
}

export function AdvancedToolsHub() {
  const topics = useTopics();
  const visibility = useVisibilitySummary();
  const latestTools = useToolLatestRuns();
  const activity = useActivity();

  const topicDescription = topics.data
    ? countLabel(topics.data.topics.length, "topic")
    : "Topic planning";
  const visibilityDescription = visibility.data?.hasAudit ? "Audit available" : "Ready to audit";
  const activeToolCount = latestTools.data ? Object.keys(latestTools.data.latest).length : null;
  const extraToolsDescription =
    activeToolCount == null
      ? "One-off analyzers"
      : activeToolCount > 0
        ? countLabel(activeToolCount, "tool with a recent run", "tools with recent runs")
        : "No recent runs";
  const workEntryCount = activity.data
    ? activity.data.jobs.length + activity.data.runs.length + activity.data.competitors.length
    : null;
  const workLogDescription =
    workEntryCount == null ? "Job history" : countLabel(workEntryCount, "entry", "entries");

  const cards: ToolCard[] = [
    {
      href: "/topics",
      title: "Topic Queue",
      description: topicDescription,
      eyebrow: "Plan",
      icon: BulletListIcon,
    },
    {
      href: "/visibility",
      title: "Visibility",
      description: visibilityDescription,
      eyebrow: "Measure",
      icon: GaugeIcon,
    },
    {
      href: "/tools/explore",
      title: "Extra Tools",
      description: extraToolsDescription,
      eyebrow: "Analyze",
      icon: WorkshopIcon,
    },
    {
      href: "/activity",
      title: "Work Log",
      description: workLogDescription,
      eyebrow: "Review",
      icon: CalendarIcon,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Advanced Tools"
        description="Open focused workflows for planning, visibility analysis, diagnostics, and Claudia's work history."
        meta={
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <LayersIcon className="size-3.5" aria-hidden />
            Workshop
          </span>
        }
      />

      <section aria-labelledby="tool-workspaces-title" className="space-y-4">
        <div>
          <h2 id="tool-workspaces-title" className="text-lg font-semibold tracking-tight">
            Workspaces
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Start with the workspace that matches the job you need to do.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <AdvancedToolCard key={card.href} {...card} />
          ))}
        </div>
      </section>

      <Card>
        <Card.Header className="p-5 pb-2 sm:p-6 sm:pb-2">
          <Card.Title>Advanced Controls</Card.Title>
          <Card.Description>
            Direct access to detailed queues and evidence views.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-5 pb-5 sm:px-6 sm:pb-6">
          <Accordion>
            <Accordion.Item id="advanced-controls">
              <Accordion.Heading>
                <Accordion.Trigger>
                  Show detailed controls
                  <Accordion.Indicator>
                    <ChevronRightIcon className="size-4" aria-hidden />
                  </Accordion.Indicator>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="grid gap-2 pt-2 sm:grid-cols-2">
                  {ADVANCED_CONTROLS.map((control) => {
                    const Icon = control.icon;
                    return (
                      <HeroLink
                        key={control.href}
                        href={control.href}
                        className="flex min-h-16 items-center gap-3 rounded-xl px-3 py-2 text-foreground no-underline hover:bg-surface-secondary"
                      >
                        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{control.title}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-muted">
                            {control.description}
                          </span>
                        </span>
                        <ChevronRightIcon className="size-4 shrink-0 text-muted" aria-hidden />
                      </HeroLink>
                    );
                  })}
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Card.Content>
      </Card>

      <HeroLink
        href="/dashboard"
        className={`${buttonVariants({ variant: "outline" })} no-underline`}
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Back to dashboard
      </HeroLink>
    </main>
  );
}
