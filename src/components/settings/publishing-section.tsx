"use client";

import { AlertDialog, Button, Card, Skeleton, toast, useOverlayState } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Section } from "@/components/feedback/section";
import { ArrowRightIcon, CheckIcon, GlobeIcon, UserInputIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { combineQueries, queryKeys, useIntegrations, useMe } from "@/lib/api/queries";
import { cn } from "@/lib/cn";

type PublishingPreference = "FULL_AUTO" | "REVIEW";

function PublishingSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading publishing settings">
      <Skeleton className="h-48 rounded-3xl" />
      <Skeleton className="h-32 rounded-3xl" />
    </div>
  );
}

function PreferenceChoice({
  selected,
  title,
  description,
  icon,
  disabled,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant={selected ? "secondary" : "outline"}
      className="h-auto min-h-32 justify-start gap-4 whitespace-normal p-5 text-left transition-transform active:scale-[0.96]"
      aria-pressed={selected}
      isDisabled={disabled}
      onPress={onPress}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-semibold text-foreground">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </Button>
  );
}

export function PublishingSection() {
  const query = combineQueries(useMe(), useIntegrations());
  const queryClient = useQueryClient();
  const confirmAutomatic = useOverlayState();

  return (
    <Section query={query} skeleton={<PublishingSkeleton />} errorLabel="Couldn't load publishing settings.">
      {([meData, integrationData]) => {
        const activeBrand = meData.brands.find((brand) => brand.id === meData.activeBrandId) ?? meData.brands[0];
        if (!activeBrand) return <Card><Card.Content>No brand selected.</Card.Content></Card>;
        return (
          <PublishingPreferences
            key={activeBrand.id}
            brandId={activeBrand.id}
            currentMode={activeBrand.autonomyMode}
            connectedDestinations={integrationData.integrations.filter(
              (item) => item.enabled && item.requirementsMet,
            ).map((item) => item.name)}
            confirmAutomatic={confirmAutomatic}
            queryClient={queryClient}
          />
        );
      }}
    </Section>
  );
}

function PublishingPreferences({
  brandId,
  currentMode,
  connectedDestinations,
  confirmAutomatic,
  queryClient,
}: {
  brandId: string;
  currentMode: string;
  connectedDestinations: string[];
  confirmAutomatic: ReturnType<typeof useOverlayState>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [preference, setPreference] = useState<PublishingPreference>(
    currentMode === "FULL_AUTO" ? "FULL_AUTO" : "REVIEW",
  );
  const update = useMutation({
    mutationFn: (autonomyMode: PublishingPreference) =>
      apiPatch("/api/brand/settings", { brandId, autonomyMode }),
    onSuccess: (_data, autonomyMode) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      void queryClient.invalidateQueries({ queryKey: queryKeys.brandAutonomy });
      toast.success(
        autonomyMode === "FULL_AUTO"
          ? "Claudia will publish automatically after quality checks."
          : "Claudia will ask you to review content before publishing.",
      );
    },
    onError: (error, autonomyMode) => {
      setPreference(autonomyMode === "FULL_AUTO" ? "REVIEW" : "FULL_AUTO");
      toast.danger(getErrorMessage(error, "Could not update publishing."));
    },
  });

  function apply(next: PublishingPreference) {
    if (next === preference || update.isPending) return;
    setPreference(next);
    update.mutate(next);
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl p-0">
        <Card.Header className="p-5 pb-3 sm:p-6 sm:pb-3">
          <Card.Title>How should Claudia publish?</Card.Title>
          <Card.Description>Choose once. You can change this whenever you need.</Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-3 p-5 pt-2 sm:grid-cols-2 sm:p-6 sm:pt-2">
          <PreferenceChoice
            selected={preference === "FULL_AUTO"}
            title="Publish automatically after quality checks"
            description="Claudia publishes approved content to connected destinations without waiting."
            icon={<CheckIcon className="size-4" />}
            disabled={update.isPending}
            onPress={() => {
              if (preference !== "FULL_AUTO") confirmAutomatic.open();
            }}
          />
          <PreferenceChoice
            selected={preference === "REVIEW"}
            title="Let me review before publishing"
            description="Claudia prepares content and asks for your decision before it goes live."
            icon={<UserInputIcon className="size-4" />}
            disabled={update.isPending}
            onPress={() => apply("REVIEW")}
          />
        </Card.Content>
      </Card>

      <Card className="rounded-3xl p-0">
        <Card.Content className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted" aria-hidden>
              <GlobeIcon className="size-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">Publishing destinations</h2>
              {connectedDestinations.length > 0 ? (
                <p className="mt-1 text-sm leading-6 text-muted">
                  Connected to {connectedDestinations.join(", ")}.
                </p>
              ) : (
                <ToneText tone="warning" className="mt-1 block text-sm">
                  Connect a destination before the first article is ready to publish.
                </ToneText>
              )}
            </div>
          </div>
          <Link
            href="/settings?tab=integrations"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-11 shrink-0 gap-2 transition-transform active:scale-[0.96]",
            )}
          >
            Manage connections
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </Card.Content>
      </Card>

      <AlertDialog.Backdrop isOpen={confirmAutomatic.isOpen} onOpenChange={confirmAutomatic.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[440px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="warning" />
              <AlertDialog.Heading>Publish automatically?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Claudia will publish only after quality, source, originality, and permission checks pass. Every publication stays recorded.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Keep review first</Button>
              <Button slot="close" onPress={() => apply("FULL_AUTO")}>Publish automatically</Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
