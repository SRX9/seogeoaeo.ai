"use client";

import { Card } from "@heroui/react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { TOOLBOX_META } from "@/lib/visibility/toolbox-meta";

/** V8.3 — Toolbox grid, grouped by pillar, rendered entirely from the registry. */

const PILLARS: { key: string; label: string }[] = [
  { key: "seo", label: "Google & search" },
  { key: "aeo", label: "Answer boxes" },
  { key: "geo", label: "AI assistants" },
];

export default function ToolboxPage() {
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
              {tools.map((t) => (
                <Link key={t.slug} href={`/tools/${t.slug}`}>
                  <Card className="h-full p-4 transition hover:border-primary">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{t.name}</p>
                      <span className="shrink-0 rounded bg-default-100 px-2 py-0.5 text-xs">
                        {CREDIT_COSTS[t.costKey]} cr
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-default-500">{t.description}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
