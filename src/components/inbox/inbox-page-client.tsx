"use client";

import { Card, Skeleton } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { CircleCheckIcon } from "@/components/icons";
import { Section } from "@/components/feedback/section";
import { OwnerRequestList } from "@/components/inbox/owner-request-list";
import { ToneText } from "@/components/ui/status-text";
import { useInbox } from "@/lib/api/queries";

function InboxSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <Skeleton className="h-64 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  );
}

export function InboxPageClient() {
  const inbox = useInbox();
  const count = inbox.data?.inboxCount ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-5 pb-10 pt-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Needs your input
          </h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
            Claudia only asks when a real decision, connection, or permission needs you.
          </p>
        </div>
        <ToneText tone={count > 0 ? "warning" : "success"}>
          {count > 0 ? `${count} waiting` : "All caught up"}
        </ToneText>
      </header>

      <Section query={inbox} skeleton={<InboxSkeleton />} errorLabel="Couldn't load your inbox.">
        {(data) => (
          <div className="space-y-5">
            <OwnerRequestList requests={data.requests} />
            {data.inboxCount === 0 ? (
              <Card>
                <EmptyState>
                  <EmptyState.Header>
                    <CircleCheckIcon className="size-8 text-success" />
                    <EmptyState.Title>Nothing needs you right now</EmptyState.Title>
                    <EmptyState.Description>
                      Claudia will keep working and ask here only when your input is necessary.
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
