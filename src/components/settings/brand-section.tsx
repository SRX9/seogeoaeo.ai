"use client";

import { Card } from "@heroui/react";
import { BrandProfileForm } from "@/components/brand/brand-profile-form";
import { CompetitorsPanel } from "@/components/brand/competitors-panel";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useBrandProfile, useCompetitors, useMe } from "@/lib/api/queries";

export function BrandSection() {
  const me = useMe();
  const profile = useBrandProfile();
  const competitors = useCompetitors();

  const isLoading = me.isLoading || profile.isLoading || competitors.isLoading;
  const error = me.error || profile.error || competitors.error;

  if (isLoading) {
    return <PageLoader label="Loading brand profile…" />;
  }
  if (error || !profile.data || !competitors.data) {
    return (
      <PageError
        error={error}
        onRetry={() => {
          profile.refetch();
          competitors.refetch();
        }}
      />
    );
  }

  const brandName =
    me.data?.brands.find((brand) => brand.id === me.data?.activeBrandId)?.name ?? "your brand";

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
          <BrandProfileForm initial={profile.data.profile} />
        </Card.Content>
      </Card>

      <CompetitorsPanel competitors={competitors.data.competitors} />
    </div>
  );
}
