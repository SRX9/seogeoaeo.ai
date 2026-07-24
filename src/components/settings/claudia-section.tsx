"use client";

import type { ReactNode } from "react";
import { ClaudiaIcon, GlobeIcon } from "@/components/icons";
import { PublishingSection } from "@/components/settings/publishing-section";
import { WorkPreferencesSection } from "@/components/settings/work-preferences-section";

function SettingsGroupHeading({
  icon,
  id,
  title,
  description,
}: {
  icon: ReactNode;
  id: string;
  title: string;
  description: string;
}) {
  return (
    <header className="flex items-start gap-3">
      <span className="mt-1 shrink-0 text-muted" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2 id={id} className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
    </header>
  );
}

export function ClaudiaSection() {
  return (
    <div className="max-w-6xl space-y-10">
      <section className="space-y-5" aria-labelledby="publishing-review-title">
        <SettingsGroupHeading
          icon={<GlobeIcon className="size-[18px]" />}
          id="publishing-review-title"
          title="Publishing & review"
          description="Set the level of review you want before content reaches your audience."
        />
        <PublishingSection />
      </section>

      <section
        className="space-y-5 border-t border-separator pt-8"
        aria-labelledby="work-updates-title"
      >
        <SettingsGroupHeading
          icon={<ClaudiaIcon className="size-[18px]" />}
          id="work-updates-title"
          title="Work & updates"
          description="Control Claudia's working rhythm, availability, and the updates you receive."
        />
        <WorkPreferencesSection />
      </section>
    </div>
  );
}
