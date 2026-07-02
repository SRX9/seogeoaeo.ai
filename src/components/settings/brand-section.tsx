"use client";

import { Card } from "@heroui/react";
import { BrandProfileForm } from "@/components/brand/brand-profile-form";
import { CompetitorsPanel } from "@/components/brand/competitors-panel";
import { UseCasesPanel } from "@/components/brand/use-cases-panel";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import {
  combineQueries,
  useBrandProfile,
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
  const competitors = useCompetitors();
  const useCases = useUseCases();
  const query = combineQueries(me, profile, competitors, useCases);

  return (
    <Section
      query={query}
      errorLabel="Couldn't load brand settings."
      skeleton={brandSkeleton}
    >
      {([meData, profileData, competitorsData, useCasesData]) => {
        const brandName =
          meData.brands.find((brand) => brand.id === meData.activeBrandId)?.name ?? "your brand";

        return (
          <div className="space-y-8">
            <p className="text-sm text-muted">
              Editing <span className="font-medium text-foreground">{brandName}</span> — product,
              audience, tone, and seed keywords for content generation.
            </p>

            <Card>
              <Card.Header>
                <Card.Title>Brand context</Card.Title>
                <Card.Description>
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

            <UseCasesPanel useCases={useCasesData.useCases} />

            <CompetitorsPanel competitors={competitorsData.competitors} />
          </div>
        );
      }}
    </Section>
  );
}
