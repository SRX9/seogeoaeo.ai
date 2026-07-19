"use client";

import { Suspense } from "react";
import { ClaudiaHero } from "@/components/dashboard/claudia-hero";
import { ClaudiaWorkPanel } from "@/components/dashboard/claudia-work-panel";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { ProductTour } from "@/components/dashboard/product-tour";
import { Section } from "@/components/feedback/section";
import { useDashboard, type DashboardData } from "@/lib/api/queries";

function ClaudiaWorkspace({ data }: { data: DashboardData }) {
  const status = data.setup.run?.status;
  // completed_degraded is a finished setup with a recoverable gap — the
  // workspace must open, not sit on the onboarding hero forever.
  if (status !== "completed" && status !== "completed_degraded") {
    return <ClaudiaHero setup={data.setup} />;
  }

  return (
    <>
      <ClaudiaWorkPanel home={data.home} />
      <Suspense fallback={null}>
        <ProductTour />
      </Suspense>
    </>
  );
}

export function DashboardPageClient() {
  const dashboard = useDashboard();

  return (
    <main className="mx-auto w-full max-w-[100rem] px-0 pb-12 lg:pb-14">
      <Section
        query={dashboard}
        skeleton={<DashboardLoadingState />}
        errorLabel="Couldn't load Claudia's workspace."
      >
        {(data) => <ClaudiaWorkspace data={data} />}
      </Section>
    </main>
  );
}
