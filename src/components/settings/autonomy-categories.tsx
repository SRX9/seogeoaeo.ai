"use client";

import { Button, Card, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Section } from "@/components/feedback/section";
import { CardSkeleton } from "@/components/feedback/skeletons";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useBrandAutonomy, type AutonomyCategoryState } from "@/lib/api/queries";

/**
 * AP4 — per-category autonomy levels beneath the Autopilot/Copilot dial.
 * Watch (0): she only reports. Prepare (1): she readies the fix and asks.
 * Apply (2): she applies it herself, logged and reversible. Each row shows
 * what she verified in that category on her last cycle — trust through
 * receipts, not promises.
 */

const LEVEL_LABELS = ["Watch", "Prepare", "Apply"] as const;

const LEVEL_HELP: Record<number, string> = {
  0: "She reports what she finds — nothing else.",
  1: "She prepares the fix and waits for your one-click approval.",
  2: "She applies it herself. Everything is logged and reversible.",
};

function CategoryRow({
  brandId,
  row,
}: {
  brandId: string;
  row: AutonomyCategoryState;
}) {
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (level: 0 | 1 | 2) =>
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
    <div className="flex flex-col gap-2 border-t border-border py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{row.label}</p>
        <p className="mt-0.5 text-sm text-muted">{LEVEL_HELP[row.level]}</p>
        {row.verifiedLastCycle > 0 ? (
          <p className="mt-0.5 text-sm text-muted">
            Last cycle: {row.verifiedLastCycle} fix{row.verifiedLastCycle === 1 ? "" : "es"} applied
            here held up on the follow-up audit.
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1">
        {LEVEL_LABELS.map((label, level) => (
          <Button
            key={label}
            size="sm"
            variant={row.level === level ? "primary" : "tertiary"}
            isDisabled={update.isPending}
            onPress={() => update.mutate(level as 0 | 1 | 2)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function AutonomyCategories({ brandId }: { brandId: string }) {
  const autonomy = useBrandAutonomy(brandId);

  return (
    <Section
      query={autonomy}
      skeleton={<CardSkeleton lines={5} />}
      errorLabel="Couldn't load Claudia's per-area permissions."
    >
      {(data) => (
        <Card>
          <Card.Header>
            <Card.Title>What Claudia may fix on her own</Card.Title>
            <Card.Description>
              Fine-tune each area she works on. The mode above sets the defaults
              {data.mode === "FULL_AUTO"
                ? " — on Autopilot she applies what she safely can and prepares the rest."
                : " — on Copilot she prepares everything and always asks first."}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <div>
              {data.categories.map((row) => (
                <CategoryRow key={row.category} brandId={brandId} row={row} />
              ))}
            </div>
            {data.lastRun?.message ? (
              <p className="mt-4 text-sm text-muted">
                Her last cycle: {data.lastRun.message}
              </p>
            ) : null}
          </Card.Content>
        </Card>
      )}
    </Section>
  );
}
