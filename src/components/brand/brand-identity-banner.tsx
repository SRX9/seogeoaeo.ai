"use client";

import { Avatar, ColorSwatch } from "@heroui/react";
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
    <header className="mt-2 flex items-center gap-3.5">
      <Avatar className="size-12 shrink-0 rounded-[0.9rem] border border-border/60 bg-surface shadow-sm sm:size-14">
        {identity.logoUrl ? <Avatar.Image alt={`${name} logo`} src={identity.logoUrl} /> : null}
        <Avatar.Fallback>{name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="truncate text-2xl font-semibold leading-none tracking-[-0.035em] text-foreground sm:text-[2rem]">
            {identity.title || name}
          </h2>
          <span className="text-sm font-medium text-muted">{identity.domain}</span>
        </div>
        <p className="mt-1.5 line-clamp-1 max-w-3xl text-sm text-muted">
          {identity.slogan || identity.description || `Brand workspace for ${name}`}
        </p>
      </div>
      {identity.colors.length > 0 ? (
        <div className="hidden items-center gap-1 sm:flex" aria-label="Brand color palette">
          {identity.colors.slice(0, 4).map((color) => (
            <ColorSwatch
              key={color.hex}
              aria-label={color.name ? `${color.name}, ${color.hex}` : color.hex}
              color={color.hex}
              colorName={color.name || undefined}
              size="xs"
            />
          ))}
        </div>
      ) : null}
    </header>
  );
}
