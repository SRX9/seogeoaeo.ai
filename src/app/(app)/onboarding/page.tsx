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
          className="fixed left-6 top-5 z-20 text-sm text-muted transition hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
      ) : null}
      <BrandOnboardingForm providers={INTEGRATION_PROVIDERS} />
    </div>
  );
}
