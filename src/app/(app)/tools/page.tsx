"use client";

import { Card } from "@heroui/react";
import Link from "next/link";
import type { ComponentType } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useToolLatestRuns } from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { PILLAR_LABELS, scoreBand } from "@/lib/visibility/display";
import { TOOLBOX_META } from "@/lib/visibility/toolbox-meta";
import {
  ActivityIcon,
  ArrowRightIcon,
  ArticlesIcon,
  CircleCheckIcon,
  GaugeIcon,
  GlobeIcon,
  QuoteIcon,
  SearchIcon,
  SparklesIcon,
} from "@/components/icons";

/**
 * V8.3 — "Extra tools" grid (linked from the Visibility sidebar section).
 * Every analyzer as a standalone tool, grouped by pillar. Each card shows the
 * tool's latest score so the grid doubles as a mini overview.
 */

type IconType = ComponentType<{ className?: string }>;

/** Card-friendly titles and icons (the registry `name`s read like spec headings). */
const TOOL_DISPLAY: Record<string, { title: string; icon: IconType }> = {
  "crawler-access": { title: "AI Crawler Access", icon: GlobeIcon },
  "content-signals": { title: "Content Signals", icon: ActivityIcon },
  "llms-txt": { title: "llms.txt Guide", icon: ArticlesIcon },
  "meta-audit": { title: "Meta & Open Graph", icon: SearchIcon },
  citability: { title: "AI Citability Score", icon: QuoteIcon },
  "technical-seo": { title: "Technical SEO Check", icon: GaugeIcon },
  "schema-audit": { title: "Schema Validator", icon: CircleCheckIcon },
  "schema-generator": { title: "JSON-LD Generator", icon: SparklesIcon },
};

const PILLAR_SECTIONS: { key: string; label: string; blurb: string }[] = [
  {
    key: "geo",
    label: PILLAR_LABELS.geo,
    blurb: "Make sure ChatGPT, Perplexity, and other assistants can find and read your site.",
  },
  {
    key: "aeo",
    label: PILLAR_LABELS.aeo,
    blurb: "Help engines lift clean answers and structured data straight from your pages.",
  },
  {
    key: "seo",
    label: PILLAR_LABELS.seo,
    blurb: "Classic search fundamentals — listings, previews, and technical health.",
  },
];

function lastRunLabel(run: { score: number | null; createdAt: string } | undefined): string {
  if (!run) return "Not run yet";
  const when = new Date(run.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (run.score == null) return `Last run ${when}`;
  return `${Math.round(run.score)}/100 · ${scoreBand(run.score)} · ${when}`;
}

function creditLabel(cost: number): string {
  return `${cost} credits`;
}

export default function ToolboxPage() {
  const latest = useToolLatestRuns().data?.latest ?? {};

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <PageHeader
        title="Extra tools"
        description="One-off analyzers on the same engine as full audits. Secondary surface — Claudia runs these on cadence for you."
      />
      {PILLAR_SECTIONS.map((pillar) => {
        const tools = TOOLBOX_META.filter((t) => t.pillar === pillar.key);
        if (tools.length === 0) return null;
        return (
          <section key={pillar.key} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">{pillar.label}</h2>
              <p className="max-w-2xl text-pretty text-sm text-muted">{pillar.blurb}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {tools.map((t) => {
                const run = latest[t.slug];
                const display = TOOL_DISPLAY[t.slug];
                const Icon = display?.icon ?? GaugeIcon;
                return (
                  <Link key={t.slug} href={`/tools/${t.slug}`} className="group block h-full">
                    <Card className="flex h-full flex-col gap-3 p-5 transition hover:border-primary">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default-100 text-default-600">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-foreground">
                            {display?.title ?? t.name}
                          </p>
                          <p className="text-xs text-default-400">
                            {creditLabel(CREDIT_COSTS[t.costKey])} per run
                          </p>
                        </div>
                        <ArrowRightIcon className="size-4 shrink-0 text-default-300 transition group-hover:translate-x-0.5 group-hover:text-default-600" />
                      </div>
                      <p className="text-sm leading-relaxed text-default-500">{t.description}</p>
                      <p
                        className={`mt-auto border-t border-default-100 pt-3 text-xs ${
                          run ? "text-default-600" : "text-default-400"
                        }`}
                      >
                        {lastRunLabel(run)}
                      </p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
