"use client";

import { Card } from "@heroui/react";
import { BrandProfileForm } from "@/components/brand/brand-profile-form";
import { BrandIntelligenceCard } from "@/components/brand/brand-intelligence-card";
import { CompetitorsPanel } from "@/components/brand/competitors-panel";
import { UseCasesPanel } from "@/components/brand/use-cases-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import {
  combineQueries,
  useBrandProfile,
  useBrandIntelligence,
  useCompetitors,
  useMe,
  useUseCases,
} from "@/lib/api/queries";

const brandSkeleton = (
  <div className="space-y-8">
    <CardSkeleton lines={5} />
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
        const brandName =
          meData.brands.find((brand) => brand.id === meData.activeBrandId)?.name ?? "your brand";

        return (
          <div className="space-y-9">
            <p className="text-sm leading-relaxed text-muted">
              Editing{" "}
              <span className="font-medium tracking-tight text-foreground">{brandName}</span>&apos;s
              product, audience, tone, and seed keywords for content generation.
            </p>

            <Card className="material-panel">
              <Card.Header>
                <Card.Title className="tracking-tight">Brand context</Card.Title>
                <Card.Description className="leading-relaxed">
                  seogeoaeo.ai uses this to research topics and write in your voice.
                </Card.Description>
              </Card.Header>
              <Card.Content>
                <BrandProfileForm
                  key={meData.activeBrandId ?? "brand-profile"}
                  initial={profileData.profile}
                />
              </Card.Content>
            </Card>

            <BrandIntelligenceCard
              brandName={brandName}
              intelligence={intelligenceData}
            />

            <UseCasesPanel useCases={useCasesData.useCases} />

            <CompetitorsPanel competitors={competitorsData.competitors} />
          </div>
        );
      }}
    </Section>
  );
}
