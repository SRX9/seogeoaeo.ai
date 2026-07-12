"use client";

import { Avatar } from "@heroui/react";
import type { BrandIdentitySummary } from "@/lib/brand/intelligence-types";

export function BrandIdentityBanner({
  name,
  identity,
}: {
  name: string;
  identity: BrandIdentitySummary | null;
}) {
  if (!identity) return null;

  return (
    <header className="flex items-center gap-3.5">
      <Avatar className="size-11 shrink-0 rounded-xl border border-border/60 bg-surface sm:size-12">
        {identity.logoUrl ? <Avatar.Image alt={`${name} logo`} src={identity.logoUrl} /> : null}
        <Avatar.Fallback>{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="truncate text-base font-semibold tracking-[-0.01em] text-foreground sm:text-lg">
            {identity.title || name}
          </h2>
          <span className="text-xs text-muted">{identity.domain}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 max-w-3xl text-sm text-muted">
          {identity.slogan || identity.description || `Brand workspace for ${name}`}
        </p>
      </div>
      {identity.colors.length > 0 ? (
        <div className="hidden items-center gap-1 sm:flex" aria-label="Brand color palette">
          {identity.colors.slice(0, 4).map((color) => (
            <span
              key={color.hex}
              className="size-2.5 rounded-full ring-1 ring-black/10 ring-inset"
              style={{ backgroundColor: color.hex }}
              title={color.name ? `${color.name} / ${color.hex}` : color.hex}
            />
          ))}
        </div>
      ) : null}
    </header>
  );
}
