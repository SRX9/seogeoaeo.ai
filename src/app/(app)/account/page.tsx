"use client";

import { Suspense } from "react";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { BillingSection } from "@/components/settings/billing-section";
import { NotificationsSection } from "@/components/settings/notifications-section";

// Account-level settings: billing plus credit-email notifications. Everything
// else is per-brand and lives under Brand settings. `BillingSection` reads
// `useSearchParams` (checkout result / upgrade flags), so it stays inside a
// Suspense boundary.
function AccountContent() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <PageHeader
        title="Account"
        description="Manage your plan, monthly usage, invoices, and account-level notifications."
      />
      <Suspense fallback={<CardSkeleton lines={6} className="min-h-80" />}>
        <BillingSection />
      </Suspense>
      <div id="credit-alert-settings">
        <NotificationsSection />
      </div>
    </main>
  );
}

export default function AccountPage() {
  return <AccountContent />;
}
