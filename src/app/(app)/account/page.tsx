"use client";

import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { BillingSection } from "@/components/settings/billing-section";
import { NotificationsSection } from "@/components/settings/notifications-section";

// Account-level settings: billing plus credit-email notifications. Everything
// else is per-brand and lives under Brand settings. `BillingSection` reads
// `useSearchParams` (checkout result / upgrade flags), so it stays inside a
// Suspense boundary.
function AccountContent() {
  return (
    <div className="mx-auto max-w-3xl space-y-9">
      <PageHeader
        title="Billing"
        description="Your plan, credits, and payment details."
      />
      <Suspense fallback={null}>
        <BillingSection />
      </Suspense>
      <NotificationsSection />
    </div>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
