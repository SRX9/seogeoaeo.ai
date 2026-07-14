"use client";

import { Accordion, Button, Card, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRightIcon, CircleCheckIcon, ShieldIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, type AgentApprovalView } from "@/lib/api/queries";

const RISK_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function titleCase(value: string) {
  return value.replaceAll(/[_-]+/g, " ").replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

function stateSummary(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const preferred = Object.entries(value).find(([, item]) =>
      typeof item === "string" || typeof item === "number" || typeof item === "boolean",
    );
    if (preferred) return String(preferred[1]);
  }
  return fallback;
}

function serialized(value: unknown) {
  return value == null ? "Not recorded" : JSON.stringify(value, null, 2);
}

function riskColor(risk: string): "danger" | "warning" | "default" {
  if (risk === "critical" || risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "default";
}

function ApprovalCard({
  approval,
  pending,
  onDecision,
}: {
  approval: AgentApprovalView;
  pending: boolean;
  onDecision: (decision: "approved" | "rejected" | "deferred") => void;
}) {
  const title = titleCase(approval.actionType);
  const current = stateSummary(approval.beforeState, "Current setup");
  const proposed = stateSummary(approval.afterState, "Proposed change");

  return (
    <Card aria-labelledby={`approval-${approval.id}`}>
      <Card.Header className="flex-row items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ToneText tone="warning">Decision Required</ToneText>
            <ToneText tone={riskColor(approval.riskLevel)}>{titleCase(approval.riskLevel)} Risk</ToneText>
          </div>
          <Card.Title id={`approval-${approval.id}`} className="mt-4 text-2xl">{title}</Card.Title>
          <Card.Description className="mt-1">{approval.expectedBenefit}</Card.Description>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning-soft-foreground" aria-hidden>
          <ShieldIcon className="size-5" />
        </span>
      </Card.Header>
      <Card.Content className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <div className="min-w-0 rounded-2xl bg-surface-secondary p-4">
            <p className="text-xs font-medium text-muted">Current</p>
            <p className="mt-2 break-words text-sm font-medium text-foreground">{current}</p>
            <p className="mt-1 truncate text-xs text-muted">{approval.resourceRef}</p>
          </div>
          <ChevronRightIcon className="hidden size-4 text-muted sm:block" aria-hidden />
          <div className="min-w-0 rounded-2xl bg-surface-secondary p-4">
            <p className="text-xs font-medium text-muted">Proposed</p>
            <p className="mt-2 break-words text-sm font-medium text-foreground">{proposed}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{approval.expectedBenefit}</p>
          </div>
        </div>

        <Accordion>
          <Accordion.Item id={`inspect-${approval.id}`}>
            <Accordion.Heading>
              <Accordion.Trigger>
                Inspect Change
                <Accordion.Indicator><ChevronRightIcon /></Accordion.Indicator>
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-muted">Before</span>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-secondary p-3 text-xs leading-5 text-foreground">{serialized(approval.beforeState)}</pre>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-muted">After</span>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-secondary p-3 text-xs leading-5 text-foreground">{serialized(approval.afterState)}</pre>
                  </div>
                </div>
                <Button className="mt-4" size="sm" variant="danger" isDisabled={pending} onPress={() => onDecision("rejected")}>
                  Decline Change
                </Button>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Card.Content>
      <Card.Footer className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" fullWidth className="sm:w-auto" isDisabled={pending} onPress={() => onDecision("deferred")}>
          Keep Current
        </Button>
        <Button fullWidth className="sm:w-auto" isPending={pending} isDisabled={pending} onPress={() => onDecision("approved")}>
          <CircleCheckIcon className="size-4" />
          Approve
        </Button>
      </Card.Footer>
    </Card>
  );
}

export function AgentApprovals({ approvals }: { approvals: AgentApprovalView[] }) {
  const queryClient = useQueryClient();
  const ordered = approvals.toSorted((left, right) => (RISK_RANK[left.riskLevel] ?? 9) - (RISK_RANK[right.riskLevel] ?? 9));
  const [openId, setOpenId] = useState<string | null>(() => ordered[0]?.id ?? null);
  const decide = useMutation({
    mutationFn: (input: { approvalId: string; decision: "approved" | "rejected" | "deferred" }) =>
      apiPatch("/api/agent/approvals", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentApprovals });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSummary });
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't save that decision.")),
  });

  if (!ordered.length) return null;

  return (
    <section className="space-y-3" aria-label="Authority decisions">
      {ordered.map((approval) => {
        const isOpen = openId === approval.id;
        const pending = decide.isPending && decide.variables?.approvalId === approval.id;
        if (isOpen) {
          return (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              pending={pending}
              onDecision={(decision) => decide.mutate({ approvalId: approval.id, decision })}
            />
          );
        }

        return (
          <Button
            key={approval.id}
            variant="ghost"
            className="h-auto min-h-14 w-full justify-start gap-3 rounded-2xl bg-surface px-4 py-3 text-left"
            onPress={() => setOpenId(approval.id)}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft text-warning-soft-foreground" aria-hidden>
              <ShieldIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{titleCase(approval.actionType)}</span>
              <span className="mt-0.5 block text-xs text-muted">{titleCase(approval.riskLevel)} Risk</span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-muted" aria-hidden />
          </Button>
        );
      })}
    </section>
  );
}
