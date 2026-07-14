"use client";

import { Card, ProgressBar } from "@heroui/react";
import { CheckIcon } from "@/components/icons";

export type DiscoveryStage = "site" | "market";

function displayHost(website: string) {
  try { return new URL(website).hostname.replace(/^www\./, ""); }
  catch { return website.replace(/^https?:\/\//, "") || "your-site.com"; }
}

export function BrandActivityMark({ brandName, website, className = "size-14" }: { brandName: string; website: string; className?: string }) {
  const label = brandName || displayHost(website);
  return <span className={`grid shrink-0 place-items-center rounded-2xl bg-surface-secondary text-sm font-semibold text-foreground ${className}`} aria-hidden>{label.slice(0, 2).toUpperCase()}</span>;
}

export function OnboardingDiscovery({ brandName, website, stage }: { brandName: string; website: string; stage: DiscoveryStage }) {
  const market = stage === "market";
  const steps = [
    { label: "Reading Site", done: true, active: false },
    { label: "Mapping Market", done: false, active: market },
    { label: "Planning First Week", done: false, active: false },
  ];
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-xl items-center py-10">
      <Card className="w-full">
        <Card.Header className="gap-2"><span className="text-sm font-medium text-accent">Discover</span><Card.Title>Building Your Operating Brief</Card.Title><Card.Description>{brandName || "Your brand"} · {displayHost(website)}</Card.Description></Card.Header>
        <Card.Content className="space-y-6">
          <ProgressBar value={market ? 66 : 33} aria-label="Discovery progress" size="sm"><ProgressBar.Track><ProgressBar.Fill /></ProgressBar.Track></ProgressBar>
          <ol className="space-y-2" role="status" aria-live="polite">
            {steps.map((item) => <li key={item.label} className="flex items-center gap-3 rounded-xl bg-surface-secondary p-4"><span className={`flex size-6 items-center justify-center rounded-full ${item.done ? "bg-success-soft text-success" : item.active ? "bg-accent-soft text-accent-soft-foreground" : "bg-default-soft text-muted"}`} aria-hidden>{item.done ? <CheckIcon className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span><span className="text-sm font-medium text-foreground">{item.label}</span>{item.active ? <span className="ml-auto text-xs text-muted">In Progress</span> : null}</li>)}
          </ol>
          <p className="text-sm text-muted">You can leave this screen. Discovery will continue in the background.</p>
        </Card.Content>
      </Card>
    </div>
  );
}
