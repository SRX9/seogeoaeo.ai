"use client";

import Link from "next/link";
import { BrandOnboardingForm } from "@/components/brand/brand-onboarding-form";
import { PageLoader } from "@/components/feedback/states";
import { useMe } from "@/lib/api/queries";
import { INTEGRATION_PROVIDERS } from "@/lib/integrations/providers";

/*
 * Fullscreen onboarding — no app shell, no card, no visible step machinery.
 * The form itself owns the whole viewport; returning users adding a second
 * brand get a quiet escape hatch back to the dashboard.
 */
export default function OnboardingPage() {
  const { data, isLoading } = useMe();

  if (isLoading) {
    return <PageLoader label="Loading…" />;
  }

  const isFirst = (data?.brands.length ?? 0) === 0;

  return (
    <div className="relative min-h-dvh">
      {!isFirst ? (
        <Link
          href="/dashboard"
          className="pressable material-chrome fixed left-5 top-4 z-30 rounded-full px-3.5 py-1.5 text-sm tracking-[0.01em] text-muted hover-fine:text-foreground sm:left-6 sm:top-5"
        >
          ← Back to Claudia
        </Link>
      ) : null}
      <BrandOnboardingForm providers={INTEGRATION_PROVIDERS} />
    </div>
  );
}
