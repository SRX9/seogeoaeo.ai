"use client";

import { useMemo } from "react";
import { AgentPlan } from "@/components/dashboard/agent-plan";
import { ApprovalInbox } from "@/components/dashboard/approval-inbox";
import { ClaudiaHero } from "@/components/dashboard/claudia-hero";
import { ProofStrip } from "@/components/dashboard/proof-strip";
import { WorkStream } from "@/components/dashboard/work-stream";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import {
  combineQueries,
  useAgentState,
  useInboxData,
  useVisibilityAnswers,
  useVisibilitySummary,
  useVisibilityTraffic,
} from "@/lib/api/queries";

const planSkeleton = <CardSkeleton lines={5} />;
const proofSkeleton = <CardSkeleton lines={4} />;
const inboxSkeleton = <CardSkeleton lines={3} />;

export default function DashboardPage() {
  const agent = useAgentState();
  const visibility = useVisibilitySummary();
  const answers = useVisibilityAnswers();
  const traffic = useVisibilityTraffic();
  const { combined: inbox } = useInboxData();
  const proof = useMemo(
    () => combineQueries(visibility, answers, traffic),
    [visibility, answers, traffic],
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10">
      <ClaudiaHero />

      <Section query={agent} skeleton={planSkeleton} errorLabel="Couldn't load the current plan.">
        {(state) => <AgentPlan state={state} />}
      </Section>

      <Section query={proof} skeleton={proofSkeleton} errorLabel="Couldn't load the outcome story.">
        {([summary, answersData, trafficData]) => (
          <ProofStrip
            summary={summary}
            answers={answersData}
            traffic={trafficData}
            events={agent.data?.recentEvents}
          />
        )}
      </Section>

      <Section query={inbox} skeleton={inboxSkeleton} errorLabel="Couldn't load owner decisions.">
        {([articlesData, findingsData, trafficData, integrationsData, automationData]) => (
          <ApprovalInbox
            articles={articlesData.articles}
            findings={findingsData.findings}
            traffic={trafficData}
            integrations={integrationsData.integrations}
            automation={automationData}
            maxRows={1}
          />
        )}
      </Section>

      {agent.data ? <WorkStream events={agent.data.recentEvents} limit={8} /> : null}
    </div>
  );
}
