"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
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

function faviconUrl(host: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

function initials(value: string) {
  const parts = value
    .replace(/https?:\/\//, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2);
  return (letters || "?").toUpperCase();
}

function radarPosition(index: number, total: number): CSSProperties {
  const count = Math.max(total, 4);
  const angle = -90 + (360 / count) * index;
  const radians = (angle * Math.PI) / 180;
  const radius = 37;
  return {
    left: `${50 + Math.cos(radians) * radius}%`,
    top: `${50 + Math.sin(radians) * radius}%`,
    animationDelay: `${index * 70}ms`,
  };
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
  const [failed, setFailed] = useState(false);
  const host = hostFromUrl(url);
  const fallback = initials(name || host || url);

  if (!host || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-surface-muted text-xs font-semibold text-foreground tabular-nums",
          className,
        )}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface p-1",
        className,
      )}
    >
      <Image
        src={faviconUrl(host)}
        alt=""
        width={32}
        height={32}
        sizes="32px"
        unoptimized
        className="size-full rounded-[inherit]"
        onError={() => setFailed(true)}
      />
    </span>
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
  const placeholders = Array.from({ length: 5 });

  return (
    <div className="rounded-lg border border-border bg-surface-muted px-4 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          aria-hidden
          className="competitor-radar relative grid size-36 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-surface"
        >
          <span className="competitor-radar__sweep absolute inset-0 rounded-full" />
          <span className="relative z-10 grid size-7 place-items-center rounded-full border border-accent/30 bg-surface shadow-sm">
            <span className="size-2 rounded-full bg-accent" />
          </span>
          {visible.length > 0
            ? visible.map((competitor, index) => (
                <span
                  key={competitor.url}
                  className="competitor-radar__blip absolute z-20"
                  style={radarPosition(index, visible.length)}
                >
                  <CompetitorLogo
                    name={competitor.name}
                    url={competitor.url}
                    className="size-8 rounded-full"
                  />
                </span>
              ))
            : placeholders.map((_, index) => (
                <span
                  key={index}
                  className="competitor-radar__placeholder absolute z-20 size-2 rounded-full bg-accent/60"
                  style={radarPosition(index, placeholders.length)}
                />
              ))}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          {visible.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {visible.slice(0, 4).map((competitor) => (
                <span
                  key={competitor.url}
                  className="max-w-full truncate rounded-md bg-surface px-2 py-1 text-xs text-muted"
                >
                  {competitor.name}
                </span>
              ))}
            </div>
          ) : scanning ? (
            <p className="mt-3 text-xs text-muted">Search, comparisons, and AI answers are being checked.</p>
          ) : null}
        </div>
      </div>
    </div>
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
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        checked ? "border-accent/50 bg-accent-soft/60" : "border-border bg-surface",
      )}
    >
      <input
        type="checkbox"
        className="mt-2 h-4 w-4 shrink-0 accent-accent"
        checked={checked}
        onChange={onToggle}
      />
      <CompetitorLogo name={suggestion.name} url={suggestion.url} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{suggestion.name}</span>
        <span className="block truncate text-sm text-muted">{host}</span>
        {suggestion.reason ? (
          <span className="mt-1 block text-sm text-muted">{suggestion.reason}</span>
        ) : null}
      </span>
    </label>
  );
}
