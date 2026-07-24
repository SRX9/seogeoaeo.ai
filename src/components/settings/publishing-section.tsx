"use client";

import { AlertDialog, Button, Card, Skeleton, toast, useOverlayState } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Section } from "@/components/feedback/section";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckIcon,
  GlobeIcon,
  UserInputIcon,
} from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { combineQueries, queryKeys, useIntegrations, useMe } from "@/lib/api/queries";
import { cn } from "@/lib/cn";
import type { AutonomyMode } from "@/lib/workspace/settings";

type PublishingPreference = AutonomyMode;
type PublishingUpdate = {
  autonomyMode: PublishingPreference;
  previous: PublishingPreference;
  fastAutoPublishAcknowledged?: boolean;
};

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
  pending,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled: boolean;
  pending: boolean;
  onPress: () => void;
}) {
  return (
    <LoadingButton
      variant={selected ? "secondary" : "outline"}
      className="h-auto min-h-28 justify-start gap-3.5 whitespace-normal rounded-xl p-4 text-left transition-transform active:scale-[0.96]"
      aria-pressed={selected}
      isDisabled={disabled}
      isPending={pending}
      onPress={onPress}
    >
      <span className="grid size-10 shrink-0 place-items-center text-muted" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-semibold text-foreground">{title}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </LoadingButton>
  );
}

export function PublishingSection() {
  const query = combineQueries(useMe(), useIntegrations());
  const queryClient = useQueryClient();
  const confirmAutomatic = useOverlayState();
  const confirmFast = useOverlayState();

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
            confirmFast={confirmFast}
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
  confirmFast,
  queryClient,
}: {
  brandId: string;
  currentMode: string;
  connectedDestinations: string[];
  confirmAutomatic: ReturnType<typeof useOverlayState>;
  confirmFast: ReturnType<typeof useOverlayState>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [preference, setPreference] = useState<PublishingPreference>(
    currentMode === "FULL_AUTO" || currentMode === "AUTO_PUBLISH_FAST"
      ? currentMode
      : "REVIEW",
  );
  const update = useMutation({
    mutationFn: ({ autonomyMode, fastAutoPublishAcknowledged }: PublishingUpdate) =>
      apiPatch("/api/brand/settings", {
        brandId,
        autonomyMode,
        ...(fastAutoPublishAcknowledged ? { fastAutoPublishAcknowledged: true } : {}),
      }),
    onSuccess: (_data, { autonomyMode }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automation });
      void queryClient.invalidateQueries({ queryKey: queryKeys.brandAutonomy });
      toast.success(
        autonomyMode === "FULL_AUTO"
          ? "Claudia will publish automatically after quality checks."
          : autonomyMode === "AUTO_PUBLISH_FAST"
            ? "Fast auto-publish is enabled. Mandatory factual and safety checks still apply."
            : "Claudia will ask you to review content before publishing.",
      );
    },
    onError: (error, { previous }) => {
      setPreference(previous);
      toast.danger(getErrorMessage(error, "Could not update publishing."));
    },
  });

  function apply(next: PublishingPreference, fastAutoPublishAcknowledged = false) {
    if (next === preference || update.isPending) return;
    const previous = preference;
    setPreference(next);
    update.mutate({ autonomyMode: next, previous, fastAutoPublishAcknowledged });
  }

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl p-0">
        <Card.Header className="flex-row items-start gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
          <span className="grid size-10 shrink-0 place-items-center text-muted" aria-hidden>
            <UserInputIcon className="size-[18px]" />
          </span>
          <div className="min-w-0 pt-0.5">
            <Card.Title>Operating mode</Card.Title>
            <Card.Description>Choose how Claudia handles review and publishing. Change modes at any time.</Card.Description>
          </div>
        </Card.Header>
        <Card.Content className="grid gap-3 p-5 pt-2 lg:grid-cols-3 sm:p-6 sm:pt-2">
          <PreferenceChoice
            selected={preference === "REVIEW"}
            title="Review"
            description="Every article waits for you to review, edit, and mark ready to publish."
            icon={<UserInputIcon className="size-4" />}
            disabled={update.isPending}
            pending={update.isPending && update.variables?.autonomyMode === "REVIEW"}
            onPress={() => apply("REVIEW")}
          />
          <PreferenceChoice
            selected={preference === "FULL_AUTO"}
            title="Auto"
            description="Claudia publishes articles that pass her checks and asks you to review only when needed."
            icon={<CheckIcon className="size-4" />}
            disabled={update.isPending}
            pending={update.isPending && update.variables?.autonomyMode === "FULL_AUTO"}
            onPress={() => {
              if (preference !== "FULL_AUTO") confirmAutomatic.open();
            }}
          />
          <PreferenceChoice
            selected={preference === "AUTO_PUBLISH_FAST"}
            title="Auto-fast"
            description="No editorial review is requested. Eligible articles publish to every connected destination."
            icon={<AlertTriangleIcon className="size-4" />}
            disabled={update.isPending}
            pending={update.isPending && update.variables?.autonomyMode === "AUTO_PUBLISH_FAST"}
            onPress={() => {
              if (preference !== "AUTO_PUBLISH_FAST") confirmFast.open();
            }}
          />
        </Card.Content>
      </Card>

      <Card className="rounded-2xl p-0">
        <Card.Content className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center text-muted" aria-hidden>
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
              Claudia will publish articles that pass her checks. When an article needs your judgment, she will hold it and ask you to review.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Keep review first</Button>
              <LoadingButton slot="close" isPending={update.isPending} onPress={() => apply("FULL_AUTO")}>Use Auto mode</LoadingButton>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <AlertDialog.Backdrop isOpen={confirmFast.isOpen} onOpenChange={confirmFast.setOpen}>
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-[480px]">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>Skip editorial publishing holds?</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Claudia will never request editorial review in this mode. Factual grounding,
              citations, safety, permissions, pauses, and destination checks can still block an
              unsafe or unsupported publication.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">Keep current mode</Button>
              <LoadingButton
                slot="close"
                variant="danger"
                isPending={update.isPending}
                onPress={() => apply("AUTO_PUBLISH_FAST", true)}
              >
                Use Auto-fast mode
              </LoadingButton>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </div>
  );
}
