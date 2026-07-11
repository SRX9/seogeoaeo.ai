"use client";

import { AgentPlan } from "@/components/dashboard/agent-plan";
import { BrandIdentityBanner } from "@/components/brand/brand-identity-banner";
import { ApprovalInbox } from "@/components/dashboard/approval-inbox";
import { ClaudiaHero } from "@/components/dashboard/claudia-hero";
import { ProofStrip } from "@/components/dashboard/proof-strip";
import { WorkStream } from "@/components/dashboard/work-stream";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useDashboard } from "@/lib/api/queries";

const planSkeleton = <CardSkeleton lines={5} />;
const proofSkeleton = <CardSkeleton lines={4} />;
const inboxSkeleton = <CardSkeleton lines={3} />;

export default function DashboardPage() {
  const dashboard = useDashboard();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 sm:space-y-14">
      {dashboard.data ? (
        <BrandIdentityBanner
          name={dashboard.data.brand.name}
          identity={dashboard.data.brand.identity}
        />
      ) : null}

      <div className="overflow-hidden rounded-[1.25rem] border border-border/70 bg-surface">
        <Section
          query={dashboard}
          skeleton={planSkeleton}
          errorLabel="Couldn't load Claudia's status."
        >
          {(data) => <ClaudiaHero setup={data.setup} agent={data.agent} />}
        </Section>

        <Section
          query={dashboard}
          skeleton={planSkeleton}
          errorLabel="Couldn't load the current plan."
        >
          {(data) => <AgentPlan state={data.agent} />}
        </Section>
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)] lg:items-start lg:gap-14">
        <Section
          query={dashboard}
          skeleton={proofSkeleton}
          errorLabel="Couldn't load the outcome story."
        >
          {(data) => (
            <ProofStrip
              summary={data.summary}
              answers={data.answers}
              traffic={data.traffic}
              events={data.agent.recentEvents}
            />
          )}
        </Section>

        <Section
          query={dashboard}
          skeleton={inboxSkeleton}
          errorLabel="Couldn't load owner decisions."
        >
          {(data) => (
            <ApprovalInbox
              articles={data.articles}
              findings={data.findings}
              traffic={data.traffic}
              integrations={data.integrations}
              automation={data.automation}
              maxRows={1}
            />
          )}
        </Section>
      </div>

      {dashboard.data ? <WorkStream events={dashboard.data.agent.recentEvents} limit={8} /> : null}
    </div>
  );
}
