"use client";

import { ClaudiaHero } from "@/components/dashboard/claudia-hero";
import { ClaudiaWorkPanel } from "@/components/dashboard/claudia-work-panel";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-loading-state";
import { Section } from "@/components/feedback/section";
import { useDashboard, type DashboardData } from "@/lib/api/queries";

function ClaudiaWorkspace({ data }: { data: DashboardData }) {
  if (data.setup.run?.status !== "completed") {
    return (
      <ClaudiaHero
        setup={data.setup}
        agent={data.agent}
        integrations={data.integrations}
      />
    );
  }

  return <ClaudiaWorkPanel state={data.agent} />;
}

export function DashboardPageClient() {
  const dashboard = useDashboard();

  return (
    <main className="mx-auto w-full max-w-7xl px-5 pb-12 pt-5 lg:pb-14 lg:pt-6">
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
