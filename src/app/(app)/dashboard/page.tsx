"use client";

import { useMemo } from "react";
import { ApprovalInbox } from "@/components/dashboard/approval-inbox";
import { AskClaudia } from "@/components/dashboard/ask-claudia";
import { ClaudiaHero } from "@/components/dashboard/claudia-hero";
import { ProofStrip } from "@/components/dashboard/proof-strip";
import { WorkStream } from "@/components/dashboard/work-stream";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { CardSkeleton, TableSkeleton } from "@/components/feedback/skeletons";
import { toActivityFeedItems } from "@/lib/activity/items";
import {
  combineQueries,
  useActivity,
  useInboxData,
  useVisibilityAnswers,
  useVisibilitySummary,
  useVisibilityTraffic,
} from "@/lib/api/queries";

const proofSkeleton = <CardSkeleton lines={2} />;
const inboxSkeleton = <CardSkeleton lines={3} />;
const streamSkeleton = <TableSkeleton rows={4} />;

/**
 * Agent OS home — Claudia's desk.
 * Presence (hero) → ask → proof → needs you → live work stream.
 * Domain snapshots and admin tables live in Workshop, not here.
 */
export default function DashboardPage() {
  const visibility = useVisibilitySummary();
  const answers = useVisibilityAnswers();
  const traffic = useVisibilityTraffic();
  const activity = useActivity();
  const { combined: inbox } = useInboxData();

  const proof = useMemo(
    () => combineQueries(visibility, answers, traffic),
    [visibility, answers, traffic],
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <PageHeader
        title="Claudia"
        description="Your autonomous employee for search, AI answers, and content."
      />

      <ClaudiaHero />

      <AskClaudia />

      <Section query={proof} skeleton={proofSkeleton} errorLabel="Couldn't load your proof numbers.">
        {([summary, answersData, trafficData]) => (
          <ProofStrip summary={summary} answers={answersData} traffic={trafficData.data} />
        )}
      </Section>

      <Section query={inbox} skeleton={inboxSkeleton} errorLabel="Couldn't load your approvals.">
        {([articlesData, findingsData, trafficData, integrationsData, automationData]) => (
          <ApprovalInbox
            articles={articlesData.articles}
            findings={findingsData.findings}
            traffic={trafficData.data}
            integrations={integrationsData.integrations}
            automation={automationData}
            maxRows={4}
          />
        )}
      </Section>

      <Section
        query={activity}
        skeleton={streamSkeleton}
        errorLabel="Couldn't load what I've been doing."
      >
        {(data) => <WorkStream items={toActivityFeedItems(data)} limit={8} />}
      </Section>
    </div>
  );
}
