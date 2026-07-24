"use client";

import { Card, Input, ListBox, Select, toast } from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldIcon } from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiGet, apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";

const POLICY_QUERY_KEY = ["agent", "policies"] as const;
const CAPABILITIES = [
  "article.create",
  "article.update",
  "article.meta.update",
  "article.schema.update",
  "site.meta.update",
  "site.schema.update",
  "robots.update",
  "llms_txt.update",
] as const;

type PolicyView = {
  id: string;
  effect: "allow" | "deny";
  capabilities: string[];
  resources: { type: string; values?: string[] };
  conditions: Array<{ type: string; value?: string }>;
  expiresAt: string | null;
  originalText: string;
  parserVersion: string;
};

type PoliciesResponse = { policies: PolicyView[] };
type Simulation = {
  decision: "allow" | "deny" | "no_match";
  matchingPolicyIds: string[];
  reason: string;
};

export function PolicySimulator() {
  const queryClient = useQueryClient();
  const [capability, setCapability] = useState<(typeof CAPABILITIES)[number]>("article.create");
  const [resourceRef, setResourceRef] = useState("wordpress:article:example");
  const [destination, setDestination] = useState("wordpress");
  const policies = useQuery({
    queryKey: POLICY_QUERY_KEY,
    queryFn: () => apiGet<PoliciesResponse>("/api/agent/policies"),
  });
  const simulate = useMutation({
    mutationFn: () => apiPost<Simulation>("/api/agent/policies", {
      capability,
      resourceRef,
      destination: destination.trim() || null,
    }),
    onError: (error) => toast.danger(getErrorMessage(error, "Could not simulate this action")),
  });
  const revoke = useMutation({
    mutationFn: (policyId: string) => apiPatch("/api/agent/policies", { policyId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: POLICY_QUERY_KEY });
      toast.success("Policy revoked. Running work will recheck before its next live action.");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Could not revoke this policy")),
  });

  return (
    <Card>
      <Card.Header className="gap-3">
        <div className="grid size-10 place-items-center text-accent" aria-hidden>
          <ShieldIcon className="size-4" />
        </div>
        <div>
          <Card.Title>Authority Policies</Card.Title>
          <Card.Description>
            Inspect Claudia&apos;s canonical interpretation and test a proposed action without changing anything.
          </Card.Description>
        </div>
      </Card.Header>
      <Card.Content className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            aria-label="Capability"
            value={capability}
            onChange={(value) => setCapability(String(value) as typeof capability)}
          >
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {CAPABILITIES.map((item) => (
                  <ListBox.Item key={item} id={item} textValue={item}>
                    {item}<ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Input
            aria-label="Resource reference"
            value={resourceRef}
            onChange={(event) => setResourceRef(event.target.value)}
            placeholder="wordpress:article:slug"
          />
          <Input
            aria-label="Destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="wordpress"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LoadingButton
            variant="outline"
            isPending={simulate.isPending}
            isDisabled={!resourceRef.trim()}
            className="active:scale-[0.96] transition-transform"
            onPress={() => simulate.mutate()}
          >
            Test action
          </LoadingButton>
          {simulate.data ? (
            <p className={simulate.data.decision === "deny" ? "text-sm text-danger" : "text-sm text-muted"}>
              {simulate.data.decision === "no_match" ? "No matching delegation" : simulate.data.decision}. {simulate.data.reason}
            </p>
          ) : null}
        </div>

        <div className="space-y-3" aria-live="polite">
          {policies.isLoading ? <p className="text-sm text-muted">Loading policies…</p> : null}
          {policies.data?.policies.length === 0 ? (
            <p className="text-sm text-muted">No canonical owner policies are active.</p>
          ) : null}
          {policies.data?.policies.map((policy) => (
            <div key={policy.id} className="rounded-xl bg-surface-secondary p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className={policy.effect === "deny" ? "text-sm font-semibold text-danger" : "text-sm font-semibold text-success"}>
                    {policy.effect === "deny" ? "Restriction" : "Confirmed permission"}
                  </p>
                  <p className="text-sm text-foreground">{policy.originalText}</p>
                  <p className="break-words font-mono text-xs leading-5 text-muted">
                    {JSON.stringify({ capabilities: policy.capabilities, resources: policy.resources, conditions: policy.conditions })}
                  </p>
                </div>
                <LoadingButton
                  variant="ghost"
                  size="sm"
                  isDisabled={revoke.isPending}
                  isPending={revoke.isPending && revoke.variables === policy.id}
                  className="min-h-10 shrink-0 active:scale-[0.96] transition-transform"
                  onPress={() => revoke.mutate(policy.id)}
                >
                  Revoke
                </LoadingButton>
              </div>
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}
