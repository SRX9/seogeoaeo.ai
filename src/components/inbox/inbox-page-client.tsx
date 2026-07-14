"use client";

import { Card, Skeleton } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { CircleCheckIcon } from "@/components/icons";
import { ApprovalInbox } from "@/components/dashboard/approval-inbox";
import { Section } from "@/components/feedback/section";
import { AgentApprovals } from "@/components/inbox/agent-approvals";
import { ToneText } from "@/components/ui/status-text";
import { useInbox } from "@/lib/api/queries";

function InboxSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  );
}

export function InboxPageClient() {
  const inbox = useInbox();
  const count = inbox.data?.inboxCount ?? 0;
  const minutes = Math.max(1, Math.min(12, count + 1));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="sr-only">Inbox</h1>
          <p className="max-w-xl text-sm leading-6 text-muted">
            Review only the decisions that need your authority.
          </p>
        </div>
        <ToneText tone={count > 0 ? "warning" : "success"}>
          <span>
            {count > 0 ? `${count} Decision${count === 1 ? "" : "s"} · ${minutes} Min` : "All Caught Up"}
          </span>
        </ToneText>
      </header>

      <Section query={inbox} skeleton={<InboxSkeleton />} errorLabel="Couldn't load your inbox.">
        {(data) => (
          <div className="space-y-6">
            <AgentApprovals approvals={data.approvals} />
            <ApprovalInbox
              articles={data.articles}
              findings={data.findings}
              traffic={data.traffic}
              integrations={data.integrations}
              automation={data.automation}
              showHeader={false}
              showEmptyState={false}
              presentation="inbox-page"
            />
            {data.inboxCount === 0 ? (
              <Card>
                <EmptyState>
                  <EmptyState.Header>
                    <EmptyState.Media variant="icon"><CircleCheckIcon /></EmptyState.Media>
                    <EmptyState.Title>All Caught Up</EmptyState.Title>
                    <EmptyState.Description>
                      New decisions will appear here when Claudia needs your authority.
                    </EmptyState.Description>
                  </EmptyState.Header>
                </EmptyState>
              </Card>
            ) : null}
          </div>
        )}
      </Section>
    </main>
  );
}
