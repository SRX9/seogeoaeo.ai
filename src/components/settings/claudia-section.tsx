"use client";

import { PublishingSection } from "@/components/settings/publishing-section";
import { WorkPreferencesSection } from "@/components/settings/work-preferences-section";

export function ClaudiaSection() {
  return (
    <div className="space-y-5">
      <PublishingSection />
      <WorkPreferencesSection />
    </div>
  );
}
