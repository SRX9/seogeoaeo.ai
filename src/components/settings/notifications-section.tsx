"use client";

import { Card, Switch, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useMe } from "@/lib/api/queries";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";

const notificationsSkeleton = <CardSkeleton lines={2} />;

function NotificationsPanel({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(() => enabled);
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: (creditEmailsEnabled: boolean) =>
      apiPatch("/api/account/notifications", { creditEmailsEnabled }),
    onSuccess: (_data, next) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(
        next
          ? "You'll get an email when your content agent runs low on credits."
          : "Credit emails are off — your agent won't email you about credits.",
      );
    },
    onError: (error, next) => {
      setOn(!next); // revert the optimistic toggle
      toast.danger(getErrorMessage(error, "Could not update notifications"));
    },
  });

  function handleToggle(next: boolean) {
    setOn(next);
    update.mutate(next);
  }

  return (
    <Card className="material-panel">
      <Card.Header>
        <Card.Title className="tracking-tight">Notifications</Card.Title>
        <Card.Description className="leading-relaxed">
          Emails about your content agent and credits.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium tracking-tight text-foreground">
              Low &amp; out-of-credit emails
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Get notified when your content agent is running low on or out of credits.
            </p>
          </div>
          <Switch
            aria-label="Low and out-of-credit emails"
            isSelected={on}
            isDisabled={update.isPending}
            onChange={handleToggle}
          >
            <Switch.Content>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        </div>
      </Card.Content>
    </Card>
  );
}

export function NotificationsSection() {
  const me = useMe();

  return (
    <Section
      query={me}
      skeleton={notificationsSkeleton}
      errorLabel="Couldn't load notification settings."
    >
      {(data) =>
        data.subscription ? (
          <NotificationsPanel
            key={String(data.subscription.creditEmailsEnabled)}
            enabled={data.subscription.creditEmailsEnabled}
          />
        ) : (
          <p className="text-sm text-muted">No subscription on this workspace yet.</p>
        )
      }
    </Section>
  );
}
