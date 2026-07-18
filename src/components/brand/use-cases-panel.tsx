"use client";

import { Card, Form, Input, Label, Switch, toast } from "@heroui/react";
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
 * C1 target-profile inventory: Claudia finds the buyer and user profiles most
 * likely to need the product; a two-minute review here multiplies the quality
 * of every bottom-of-funnel article built on it. Rows the user edits or adds
 * are never overwritten by regeneration.
 */
export function UseCasesPanel({ useCases }: UseCasesPanelProps) {
  const queryClient = useQueryClient();
  // Controlled state: HeroUI inputs don't reliably submit via native FormData.
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
    onSuccess: () => toast.success("Customer profile added"),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not add customer profile")),
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
          ? `Claudia found ${result.added} new profile${result.added > 1 ? "s" : ""}.`
          : "No new profiles found. Your current list already covers the available evidence.",
      );
    } catch (error) {
      toast.danger(getErrorMessage(error, "Could not refresh customer profiles"));
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
            <Card.Title className="tracking-tight">Customer profiles</Card.Title>
            <Card.Description className="leading-relaxed">
              Claudia searches for the buyers and users most likely to need your product. Confirm
              the roles, industries, and situations she should write for.
            </Card.Description>
          </div>
          <LoadingButton
            variant="secondary"
            size="sm"
            isPending={regenerating}
            pendingLabel="Searching..."
            onPress={regenerate}
          >
            Search from profile
          </LoadingButton>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        {useCases.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">
            No customer profiles yet. Save your brand profile and Claudia searches automatically,
            or add one below.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {useCases.map((useCase) => (
              <li
                key={useCase.id}
                className={`surface-interactive flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/50 bg-surface/70 p-4 ${useCase.enabled ? "" : "opacity-55"}`}
              >
                <div>
                  <p className="font-medium tracking-tight text-foreground">{useCase.persona}</p>
                  <p className="text-sm leading-relaxed text-muted">
                    {useCase.job}
                    {useCase.industry ? ` · ${useCase.industry}` : ""}
                  </p>
                  {useCase.evidence ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      Seen: {useCase.evidence}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {useCase.origin === "user" || useCase.edited ? (
                    <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                      yours
                    </span>
                  ) : null}
                  <Switch
                    aria-label={`Write for "${useCase.persona}"`}
                    isSelected={useCase.enabled}
                    isDisabled={toggle.isPending}
                    onChange={(enabled) => toggle.mutate({ id: useCase.id, enabled })}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Form aria-label="Add buyer profile" onSubmit={handleAdd} className="space-y-3 border-t border-separator pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="uc-job">Need or situation</Label>
              <Input id="uc-job" name="job" value={fields.job} onChange={set("job")} required placeholder="prove AI search visibility before competitors do" variant="secondary" fullWidth />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uc-persona">Customer or user profile</Label>
              <Input id="uc-persona" name="persona" value={fields.persona} onChange={set("persona")} required placeholder="B2B SaaS marketing leads" variant="secondary" fullWidth />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uc-industry">Industry or segment</Label>
              <Input id="uc-industry" name="industry" value={fields.industry} onChange={set("industry")} placeholder="AI search, SEO, content marketing" variant="secondary" fullWidth />
            </div>
          </div>
          <LoadingButton type="submit" variant="secondary" isPending={add.isPending} pendingLabel="Adding...">
            Add profile
          </LoadingButton>
        </Form>
      </Card.Content>
    </Card>
  );
}
