"use client";

import { Avatar, Card, Checkbox, Skeleton } from "@heroui/react";
import { ThinkingOrb } from "thinking-orbs";
import { cn } from "@/lib/cn";

export type CompetitorVisual = {
  name: string;
  url: string;
  reason?: string;
};

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function initials(value: string) {
  const parts = value
    .replace(/https?:\/\//, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2);
  return (letters || "?").toUpperCase();
}

export function CompetitorLogo({
  name,
  url,
  className,
}: {
  name: string;
  url: string;
  className?: string;
}) {
  const host = hostFromUrl(url);
  const fallback = initials(name || host || url);

  return (
    <Avatar aria-hidden size="sm" className={cn("size-9 shrink-0 bg-surface-secondary", className)}>
      <Avatar.Fallback className="text-xs font-semibold tracking-tight text-foreground">
        {fallback}
      </Avatar.Fallback>
    </Avatar>
  );
}

export function CompetitorRadar({
  competitors = [],
  scanning = false,
  title,
  subtitle,
}: {
  competitors?: CompetitorVisual[];
  scanning?: boolean;
  title: string;
  subtitle: string;
}) {
  const visible = competitors.slice(0, 6);

  return (
    <Card>
      <Card.Content className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-secondary text-accent">
            {scanning ? <ThinkingOrb state="searching" size={20} aria-hidden /> : <span className="size-2 rounded-full bg-accent" />}
          </span>
          <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-foreground">{title}</p>
            <p className="mt-1 text-pretty text-sm leading-6 text-muted">{subtitle}</p>
          </div>
        </div>
        {visible.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {visible.map((competitor) => (
              <span key={competitor.url} className="text-sm font-medium text-muted">
                {competitor.name}
              </span>
            ))}
          </div>
        ) : scanning ? (
          <div className="grid gap-2 sm:grid-cols-3" aria-label="Finding competitors">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-8 rounded-xl" />
            ))}
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}

export function CompetitorSuggestionCard({
  suggestion,
  checked,
  onToggle,
}: {
  suggestion: CompetitorVisual;
  checked: boolean;
  onToggle: () => void;
}) {
  const host = hostFromUrl(suggestion.url) ?? suggestion.url;

  return (
    <Checkbox
      aria-label={`${checked ? "Remove" : "Select"} ${suggestion.name}`}
      isSelected={checked}
      onChange={onToggle}
      variant="secondary"
      className={cn(
        "w-full rounded-2xl p-3.5",
        checked
          ? "bg-accent-soft/50"
          : "bg-surface-secondary",
      )}
    >
      <Checkbox.Content className="w-full items-start gap-3">
        <Checkbox.Control className="mt-2 shrink-0">
          <Checkbox.Indicator />
        </Checkbox.Control>
        <CompetitorLogo name={suggestion.name} url={suggestion.url} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium tracking-tight text-foreground">
            {suggestion.name}
          </span>
          <span className="block truncate text-sm tracking-[0.01em] text-muted">{host}</span>
          {suggestion.reason ? (
            <span className="mt-1 block text-sm leading-relaxed text-muted">
              {suggestion.reason}
            </span>
          ) : null}
        </span>
      </Checkbox.Content>
    </Checkbox>
  );
}
