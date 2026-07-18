"use client";

import { BrandSettingsCanvas } from "@/components/settings/brand-settings-canvas";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { Section } from "@/components/feedback/section";
import {
  combineQueries,
  useBrandIntelligence,
  useBrandProfile,
  useCompetitors,
  useMe,
  useUseCases,
} from "@/lib/api/queries";

const brandSkeleton = (
  <div className="space-y-8 pt-4">
    <CardSkeleton lines={2} />
    <CardSkeleton lines={3} />
    <CardSkeleton lines={3} />
  </div>
);

export function BrandSection() {
  const me = useMe();
  const profile = useBrandProfile();
  const intelligence = useBrandIntelligence();
  const competitors = useCompetitors();
  const useCases = useUseCases();
  const query = combineQueries(me, profile, intelligence, competitors, useCases);

  return (
    <Section
      query={query}
      errorLabel="Couldn't load brand settings."
      skeleton={brandSkeleton}
    >
      {([meData, profileData, intelligenceData, competitorsData, useCasesData]) => {
        const activeBrand = meData.brands.find((brand) => brand.id === meData.activeBrandId);

        return (
          <BrandSettingsCanvas
            key={activeBrand?.id ?? "brand-settings"}
            brandName={activeBrand?.name ?? "Your brand"}
            profile={profileData.profile}
            intelligence={intelligenceData}
            competitors={competitorsData.competitors}
            useCases={useCasesData.useCases}
          />
        );
      }}
    </Section>
  );
}
