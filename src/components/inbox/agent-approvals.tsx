"use client";

import { Button, Card, toast } from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  type AgentApprovalView,
} from "@/lib/api/queries";

function serialized(value: unknown) {
  return value == null ? "Not recorded" : JSON.stringify(value, null, 2);
}

export function AgentApprovals({ approvals }: { approvals: AgentApprovalView[] }) {
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (input: {
      approvalId: string;
      decision: "approved" | "rejected" | "deferred";
    }) => apiPatch("/api/agent/approvals", input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentApprovals });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSummary });
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't save that decision.")),
  });

  if (!approvals.length) return null;
  const riskRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const ordered = approvals.toSorted(
    (left, right) => (riskRank[left.riskLevel] ?? 9) - (riskRank[right.riskLevel] ?? 9),
  );

  return (
    <section className="space-y-4" aria-labelledby="agent-decisions-title">
      <div>
        <h2 id="agent-decisions-title" className="text-xl text-foreground">Decisions</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Exact authority or resource changes that Claudia cannot decide alone.
        </p>
      </div>
      <div className="space-y-3">
        {ordered.map((approval) => {
          const pending = decide.isPending && decide.variables?.approvalId === approval.id;
          return (
            <Card key={approval.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{approval.actionType}</p>
                  <p className="mt-1 break-words text-sm text-muted">{approval.resourceRef}</p>
                  <p className="mt-3 text-sm leading-6 text-foreground">
                    {approval.expectedBenefit}
                  </p>
                  <p className="mt-2 text-xs capitalize text-muted">{approval.riskLevel} risk</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    isPending={pending && decide.variables?.decision === "approved"}
                    isDisabled={decide.isPending}
                    onPress={() => decide.mutate({ approvalId: approval.id, decision: "approved" })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={decide.isPending}
                    onPress={() => decide.mutate({ approvalId: approval.id, decision: "deferred" })}
                  >
                    Defer
                  </Button>
                </div>
              </div>
              <details className="mt-4 rounded-xl bg-surface-secondary p-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Inspect proposed change
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Before</p>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                      {serialized(approval.beforeState)}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">After</p>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-xs text-foreground">
                      {serialized(approval.afterState)}
                    </pre>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="danger-soft"
                  className="mt-3"
                  isDisabled={decide.isPending}
                  onPress={() => decide.mutate({ approvalId: approval.id, decision: "rejected" })}
                >
                  Decline change
                </Button>
              </details>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
