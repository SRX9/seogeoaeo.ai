"use client";

import { Card } from "@heroui/react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { useToolLatestRuns } from "@/lib/api/queries";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { scoreBand } from "@/lib/visibility/display";
import { TOOLBOX_META } from "@/lib/visibility/toolbox-meta";

/** V8.3 — Toolbox grid, grouped by pillar, rendered entirely from the registry.
 * Each card shows the tool's latest score so the grid doubles as an overview. */

const PILLARS: { key: string; label: string }[] = [
  { key: "seo", label: "Google & search" },
  { key: "aeo", label: "Answer boxes" },
  { key: "geo", label: "AI assistants" },
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

export default function ToolboxPage() {
  const latest = useToolLatestRuns().data?.latest ?? {};

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Toolbox"
        description="Every analyzer as a standalone tool. Same engine as your full audit — findings land in your fix queue."
      />
      {PILLARS.map((pillar) => {
        const tools = TOOLBOX_META.filter((t) => t.pillar === pillar.key);
        if (tools.length === 0) return null;
        return (
          <div key={pillar.key} className="space-y-2">
            <h2 className="text-sm font-semibold text-default-600">{pillar.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {tools.map((t) => {
                const run = latest[t.slug];
                return (
                  <Link key={t.slug} href={`/tools/${t.slug}`}>
                    <Card className="h-full p-4 transition hover:border-primary">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{t.name}</p>
                        <span className="shrink-0 rounded bg-default-100 px-2 py-0.5 text-xs">
                          {CREDIT_COSTS[t.costKey]} cr
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-default-500">{t.description}</p>
                      <p className={`mt-2 text-xs ${run ? "text-default-600" : "text-default-400"}`}>
                        {lastRunLabel(run)}
                      </p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
