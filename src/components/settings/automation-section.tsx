"use client";

import { AutonomyPanel } from "@/components/settings/autonomy-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useMe } from "@/lib/api/queries";

export function AutomationSection() {
  const me = useMe();

  return (
    <Section
      query={me}
      skeleton={<CardSkeleton lines={3} />}
      errorLabel="Couldn't load automation settings."
    >
      {(data) => {
        const activeBrand =
          data.brands.find((brand) => brand.id === data.activeBrandId) ?? data.brands[0] ?? null;

        if (!activeBrand) {
          return <p className="text-sm text-muted">No brand selected.</p>;
        }

        // Key by brand so the panel remounts (and re-seeds its toggle) when the
        // user switches brands — autonomy is set per brand. The brand id is passed
        // explicitly so the write targets this brand regardless of the
        // active-brand cookie.
        return (
          <AutonomyPanel
            key={activeBrand.id}
            brandId={activeBrand.id}
            currentMode={activeBrand.autonomyMode}
          />
        );
      }}
    </Section>
  );
}
