"use client";

import { Card, Switch, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useMe, type MeResponse } from "@/lib/api/queries";

type PreferenceKey =
  | "milestoneEmailsEnabled"
  | "reviewEmailsEnabled"
  | "dailySummaryEmailsEnabled"
  | "creditEmailsEnabled";

type EmailPreferences = Record<PreferenceKey, boolean>;

const preferenceCopy: Array<{
  key: PreferenceKey;
  label: string;
  description: string;
}> = [
  {
    key: "milestoneEmailsEnabled",
    label: "Major milestones",
    description: "Setup completion and other important progress moments.",
  },
  {
    key: "reviewEmailsEnabled",
    label: "Review requests",
    description: "An article or decision is ready and needs your review.",
  },
  {
    key: "dailySummaryEmailsEnabled",
    label: "Daily standup",
    description: "A concise end-of-run summary of what Claudia did today.",
  },
  {
    key: "creditEmailsEnabled",
    label: "Capacity alerts",
    description: "Claudia is running low on or out of work capacity.",
  },
];

const notificationsSkeleton = <CardSkeleton lines={5} />;

function initialPreferences(data: MeResponse): EmailPreferences {
  return {
    ...data.workspace.emailPreferences,
    creditEmailsEnabled: data.subscription?.creditEmailsEnabled ?? true,
  };
}

function NotificationsPanel({ data }: { data: MeResponse }) {
  const [preferences, setPreferences] = useState<EmailPreferences>(() =>
    initialPreferences(data),
  );
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: ({ key, enabled }: { key: PreferenceKey; enabled: boolean }) =>
      apiPatch("/api/account/notifications", { [key]: enabled }),
    onSuccess: (_data, { enabled }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      toast.success(enabled ? "Email update turned on." : "Email update turned off.");
    },
    onError: (error, { key, enabled }) => {
      setPreferences((current) => ({ ...current, [key]: !enabled }));
      toast.danger(getErrorMessage(error, "Could not update email preferences."));
    },
  });

  function handleToggle(key: PreferenceKey, enabled: boolean) {
    setPreferences((current) => ({ ...current, [key]: enabled }));
    update.mutate({ key, enabled });
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title className="tracking-tight">Email updates</Card.Title>
        <Card.Description className="leading-relaxed">
          Choose what Claudia sends you. Every update is on by default.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="divide-y divide-separator">
          {preferenceCopy.map((preference) => (
            <div
              key={preference.key}
              className="flex min-h-20 items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="font-medium tracking-tight text-foreground">
                  {preference.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {preference.description}
                </p>
              </div>
              <Switch
                aria-label={preference.label}
                isSelected={preferences[preference.key]}
                isDisabled={
                  update.isPending && update.variables?.key === preference.key
                }
                onChange={(enabled) => handleToggle(preference.key, enabled)}
              >
                <Switch.Content>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
            </div>
          ))}
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
      errorLabel="Couldn't load email settings."
    >
      {(data) => <NotificationsPanel key={JSON.stringify(initialPreferences(data))} data={data} />}
    </Section>
  );
}
