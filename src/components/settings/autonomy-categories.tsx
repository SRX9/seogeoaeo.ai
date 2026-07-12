"use client";

import { Button, Card, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useBrandAutonomy, type AutonomyCategoryState } from "@/lib/api/queries";
import type { AutonomyLevel } from "@/lib/jobs/visibility-agent";
import {
  displayAutonomyLevel,
  isLiveApplyAvailable,
  selectableAutonomyLevels,
} from "@/lib/visibility/fix-policy";

/**
 * AP4: per-category autonomy levels beneath the Autopilot/Copilot dial.
 * Watch (0): report only. Prepare (1): ready-to-install artifact in inbox.
 * Live-apply (2): only when a site channel exists (`isLiveApplyAvailable`).
 */

const LEVEL_LABELS: Record<AutonomyLevel, string> = {
  0: "Watch",
  1: "Prepare",
  2: "Live-apply",
};

const LEVEL_HELP: Record<AutonomyLevel, string> = {
  0: "She reports what she finds: nothing else.",
  1: "She prepares a ready-to-install fix and surfaces it in your inbox.",
  2: "She pushes the fix to your connected site when a channel is available.",
};

function CategoryRow({
  brandId,
  row,
  levels,
}: {
  brandId: string;
  row: AutonomyCategoryState;
  levels: readonly AutonomyLevel[];
}) {
  const queryClient = useQueryClient();
  const shown = displayAutonomyLevel(row.level as AutonomyLevel);
  const update = useMutation({
    mutationFn: (level: AutonomyLevel) =>
      apiPatch("/api/brand/autonomy", { brandId, category: row.category, level }),
    onSuccess: (_data, level) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brandAutonomy });
      toast.success(`${row.label}: ${LEVEL_LABELS[level]}.`);
    },
    onError: (error) => {
      toast.danger(getErrorMessage(error, "Could not update this category"));
    },
  });

  return (
    <div className="flex flex-col gap-2 border-t border-border/50 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium tracking-tight text-foreground">{row.label}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted">{LEVEL_HELP[shown]}</p>
        {row.verifiedLastCycle > 0 ? (
          <p className="mt-0.5 text-sm text-muted">
            Last cycle: {row.verifiedLastCycle} fix{row.verifiedLastCycle === 1 ? "" : "es"} applied
            here held up on the follow-up audit.
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1">
        {levels.map((level) => (
          <Button
            key={level}
            size="sm"
            variant={shown === level ? "primary" : "tertiary"}
            isDisabled={update.isPending}
            onPress={() => update.mutate(level)}
          >
            {LEVEL_LABELS[level]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function AutonomyCategories({ brandId }: { brandId: string }) {
  const autonomy = useBrandAutonomy(brandId);
  const levels = selectableAutonomyLevels();
  const live = isLiveApplyAvailable();

  return (
    <Section
      query={autonomy}
      skeleton={<CardSkeleton lines={5} />}
      errorLabel="Couldn't load Claudia's per-area permissions."
    >
      {(data) => (
        <Card className="material-panel">
          <Card.Header>
            <Card.Title className="tracking-tight">
              What Claudia may prepare on her own
            </Card.Title>
            <Card.Description className="leading-relaxed">
              Fine-tune each area she works on. The mode above sets the defaults
              {data.mode === "FULL_AUTO"
                ? live
                  ? ": on Autopilot she live-applies where a channel exists and prepares the rest."
                  : ": on Autopilot she prioritizes preparing ready-to-install fixes for each area."
                : ": on Copilot she prepares everything and always asks before publishing articles."}
              {!live
                ? " Site artifacts are always owner-installed until a host/CMS push channel ships."
                : null}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div>
              {data.categories.map((row) => (
                <CategoryRow key={row.category} brandId={brandId} row={row} levels={levels} />
              ))}
            </div>
            {data.lastRun?.message ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Her last cycle: {data.lastRun.message}
              </p>
            ) : null}
          </Card.Content>
        </Card>
      )}
    </Section>
  );
}
