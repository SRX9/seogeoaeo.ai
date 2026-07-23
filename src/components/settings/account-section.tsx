"use client";

import { Card } from "@heroui/react";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { Section } from "@/components/feedback/section";
import { useMe } from "@/lib/api/queries";

export function AccountSection() {
  const me = useMe();
  return (
    <Section query={me} skeleton={<CardSkeleton lines={3} />} errorLabel="Couldn't load account details.">
      {(data) => (
        <Card>
          <Card.Header>
            <Card.Title>Account</Card.Title>
            <Card.Description>Your user and workspace details.</Card.Description>
          </Card.Header>
          <Card.Content>
            <dl className="grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted">Name</dt>
                <dd className="mt-1 text-sm text-foreground">{data.user.name || "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Email</dt>
                <dd className="mt-1 text-sm text-foreground">{data.user.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Workspace</dt>
                <dd className="mt-1 text-sm text-foreground">{data.workspace.name}</dd>
              </div>
            </dl>
          </Card.Content>
        </Card>
      )}
    </Section>
  );
}
