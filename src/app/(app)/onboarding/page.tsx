"use client";

import { BrandOnboardingForm } from "@/components/brand/brand-onboarding-form";
import { PageError, PageLoader } from "@/components/feedback/states";
import { useMe } from "@/lib/api/queries";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

/*
 * Fullscreen onboarding: no app shell, no card, no visible step machinery.
 * The form itself owns the whole viewport. It also owns exit handling so the
 * browser back button and the visible escape action share one recovery flow.
 */
export default function OnboardingPage() {
  const { data, isLoading, error, refetch } = useMe();

  if (isLoading) {
    return <PageLoader label="Loading…" />;
  }

  if (error || !data) {
    return <PageError error={error} onRetry={() => void refetch()} />;
  }

  const isFirst = data.brands.length === 0;

  return (
    <div className="relative min-h-dvh">
      <BrandOnboardingForm
        providers={INTEGRATION_PROVIDERS}
        showDashboardEscape={!isFirst}
      />
    </div>
  );
}
