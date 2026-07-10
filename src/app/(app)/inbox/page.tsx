"use client";

import { ApprovalInbox } from "@/components/dashboard/approval-inbox";
import { AgentApprovals } from "@/components/inbox/agent-approvals";
import { PageHeader } from "@/components/layout/page-header";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { useAgentApprovals, useInboxData } from "@/lib/api/queries";

const inboxSkeleton = <CardSkeleton lines={5} />;

/**
 * Agent OS Inbox — the only full-page surface that asks the owner to decide.
 * Same merge logic as the home "Needs you" section; here with room to work the queue.
 */
export default function InboxPage() {
  const { combined: inbox } = useInboxData();
  const approvals = useAgentApprovals();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-9">
      <PageHeader
        title="Inbox"
        description="Everything Claudia needs from you — approve, connect, or leave it to her."
      />
      <Section query={approvals} skeleton={inboxSkeleton} errorLabel="Couldn't load decisions.">
        {(data) => <AgentApprovals approvals={data.approvals} />}
      </Section>
      <Section query={inbox} skeleton={inboxSkeleton} errorLabel="Couldn't load your inbox.">
        {([articlesData, findingsData, trafficData, integrationsData, automationData]) => (
          <ApprovalInbox
            articles={articlesData.articles}
            findings={findingsData.findings}
            traffic={trafficData}
            integrations={integrationsData.integrations}
            automation={automationData}
            showHeader={false}
          />
        )}
      </Section>
    </div>
  );
}
