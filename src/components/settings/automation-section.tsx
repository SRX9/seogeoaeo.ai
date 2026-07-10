"use client";

import { AutonomyCategories } from "@/components/settings/autonomy-categories";
import { AutonomyPanel } from "@/components/settings/autonomy-panel";
import { BadgePanel } from "@/components/settings/badge-panel";
import { ActionHistory } from "@/components/settings/action-history";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useMe } from "@/lib/api/queries";

const automationSkeleton = <CardSkeleton lines={3} />;

export function AutomationSection() {
  const me = useMe();

  return (
    <Section
      query={me}
      skeleton={automationSkeleton}
      errorLabel="Couldn't load automation settings."
    >
      {(data) => {
        const activeBrand =
          data.brands.find((brand) => brand.id === data.activeBrandId) ?? data.brands[0] ?? null;

        if (!activeBrand) {
          return <p className="text-sm text-muted">No brand selected.</p>;
        }

        // Key by brand so the panels remount (and re-seed their toggles) when
        // the user switches brands — both settings are per brand. The brand id
        // is passed explicitly so the write targets this brand regardless of
        // the active-brand cookie.
        return (
          <div className="space-y-8">
            <AutonomyPanel
              key={`autonomy-${activeBrand.id}`}
              brandId={activeBrand.id}
              currentMode={activeBrand.autonomyMode}
            />
            <AutonomyCategories
              key={`autonomy-categories-${activeBrand.id}`}
              brandId={activeBrand.id}
            />
            <BadgePanel
              key={`badge-${activeBrand.id}`}
              brandId={activeBrand.id}
              initialEnabled={activeBrand.badgePublic}
            />
            <ActionHistory />
          </div>
        );
      }}
    </Section>
  );
}
