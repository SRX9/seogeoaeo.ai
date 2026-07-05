"use client";

import { Card, Input, Label, toast } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiPatch, apiPost, apiPut, getErrorMessage } from "@/lib/api/fetcher";
import { useOptimisticMutation } from "@/lib/api/optimistic";
import { queryKeys, type UseCase } from "@/lib/api/queries";

type UseCasesCache = { useCases: UseCase[] };

type UseCasesPanelProps = {
  useCases: UseCase[];
};

const EMPTY_USE_CASE = { job: "", persona: "", industry: "" };

/**
 * C1 use-case inventory: Claudia maps the jobs buyers hire the product for; a
 * two-minute review here multiplies the quality of every bottom-of-funnel
 * article built on it. Rows the user edits or adds are never overwritten by
 * regeneration.
 */
export function UseCasesPanel({ useCases }: UseCasesPanelProps) {
  const queryClient = useQueryClient();
  // Controlled state — HeroUI inputs don't reliably submit via native FormData.
  const [fields, setFields] = useState(EMPTY_USE_CASE);
  const [regenerating, setRegenerating] = useState(false);

  const set =
    (key: keyof typeof EMPTY_USE_CASE) =>
    (event: { target: { value: string } }) =>
      setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const add = useOptimisticMutation<
    unknown,
    { job: string; persona: string; industry: string },
    UseCasesCache
  >({
    mutationFn: (input) => apiPost("/api/brand/use-cases", input),
    queryKey: queryKeys.useCases,
    optimisticUpdate: (current, input) => ({
      useCases: [
        ...(current?.useCases ?? []),
        {
          id: `temp-${Date.now()}`,
          job: input.job,
          persona: input.persona,
          industry: input.industry || null,
          evidence: null,
          origin: "user",
          enabled: true,
          edited: false,
        },
      ],
    }),
    onSuccess: () => toast.success("Use case added"),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not add use case")),
  });

  const toggle = useOptimisticMutation<unknown, { id: string; enabled: boolean }, UseCasesCache>({
    mutationFn: ({ id, enabled }) => apiPatch(`/api/brand/use-cases/${id}`, { enabled }),
    queryKey: queryKeys.useCases,
    optimisticUpdate: (current, { id, enabled }) => ({
      useCases: (current?.useCases ?? []).map((item) =>
        item.id === id ? { ...item, enabled } : item,
      ),
    }),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not update use case")),
  });

  async function regenerate() {
    setRegenerating(true);
    try {
      const result = await apiPut<{ added: number; useCases: UseCase[] }>("/api/brand/use-cases");
      queryClient.setQueryData<UseCasesCache>(queryKeys.useCases, { useCases: result.useCases });
      toast.success(
        result.added > 0
          ? `Claudia found ${result.added} new use case${result.added > 1 ? "s" : ""}.`
          : "Nothing new — your inventory already covers what Claudia can see.",
      );
    } catch (error) {
      toast.danger(getErrorMessage(error, "Could not regenerate use cases"));
    } finally {
      setRegenerating(false);
    }
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    add.mutate(
      {
        job: fields.job.trim(),
        persona: fields.persona.trim(),
        industry: fields.industry.trim(),
      },
      { onSuccess: () => setFields(EMPTY_USE_CASE) },
    );
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Use cases</Card.Title>
            <Card.Description>
              Claudia mapped what buyers hire your product for. Confirm these are right and she
              writes for the buyers that matter — each one seeds tutorials, comparisons, and
              answer pages.
            </Card.Description>
          </div>
          <LoadingButton
            variant="secondary"
            size="sm"
            isPending={regenerating}
            pendingLabel="Mapping…"
            onPress={regenerate}
          >
            Re-map from profile
          </LoadingButton>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        {useCases.length === 0 ? (
          <p className="text-sm text-muted">
            No use cases yet. Save your brand profile and Claudia maps them automatically, or add
            one below.
          </p>
        ) : (
          <ul className="space-y-3">
            {useCases.map((useCase) => (
              <li
                key={useCase.id}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 ${useCase.enabled ? "" : "opacity-55"}`}
              >
                <div>
                  <p className="font-medium text-foreground">{useCase.job}</p>
                  <p className="text-sm text-muted">
                    {useCase.persona}
                    {useCase.industry ? ` · ${useCase.industry}` : ""}
                  </p>
                  {useCase.evidence ? (
                    <p className="mt-1 text-xs text-muted">Seen: {useCase.evidence}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {useCase.origin === "user" || useCase.edited ? (
                    <span className="text-xs uppercase tracking-wide text-muted">yours</span>
                  ) : null}
                  <LoadingButton
                    variant="ghost"
                    size="sm"
                    isPending={toggle.isPending && toggle.variables?.id === useCase.id}
                    isDisabled={toggle.isPending}
                    pendingLabel="Saving…"
                    onPress={() => toggle.mutate({ id: useCase.id, enabled: !useCase.enabled })}
                  >
                    {useCase.enabled ? "Disable" : "Enable"}
                  </LoadingButton>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="space-y-3 border-t border-border pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="uc-job">Job</Label>
              <Input id="uc-job" name="job" value={fields.job} onChange={set("job")} required placeholder="send automatic invoice reminders" variant="secondary" fullWidth />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uc-persona">Who does it</Label>
              <Input id="uc-persona" name="persona" value={fields.persona} onChange={set("persona")} required placeholder="freelance designers" variant="secondary" fullWidth />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uc-industry">Industry (optional)</Label>
              <Input id="uc-industry" name="industry" value={fields.industry} onChange={set("industry")} placeholder="creative services" variant="secondary" fullWidth />
            </div>
          </div>
          <LoadingButton type="submit" variant="secondary" isPending={add.isPending} pendingLabel="Adding…">
            Add use case
          </LoadingButton>
        </form>
      </Card.Content>
    </Card>
  );
}
