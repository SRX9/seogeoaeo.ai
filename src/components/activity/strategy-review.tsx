"use client";

import {
  Button,
  Card,
  Description,
  Label,
  Skeleton,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, XIcon } from "@/components/icons";
import { SteerClaudia } from "@/components/dashboard/steer-claudia";
import { StatusText, ToneText } from "@/components/ui/status-text";
import { apiGet, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/queries";

type StrategyTask = {
  id: string;
  title: string;
  reason: string;
  taskType: string;
  status: string;
  expectedImpact: string | null;
  confidence: number;
  riskLevel: string;
  requiredAuthority: string;
  dependencies: string[];
  stopConditions: string[];
  scheduledFor: string | null;
};

type StrategyReviewResponse = {
  missionId: string;
  plan: {
    id: string;
    version: number;
    rationale: string;
    windowStart: string;
    windowEnd: string;
    approvedAt: string | null;
    orderedTaskIds: string[];
  };
  tasks: StrategyTask[];
};

type ReviewOperation =
  | { operation: "reorder"; expectedPlanId: string; taskIds: string[]; reason: string; evidenceRefs: string[] }
  | { operation: "remove"; expectedPlanId: string; taskId: string; reason: string; evidenceRefs: string[] }
  | { operation: "approve"; planId: string; reason: string; evidenceRefs: string[] };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function riskTone(risk: string) {
  if (risk === "critical" || risk === "high") return "danger" as const;
  if (risk === "medium") return "warning" as const;
  return "default" as const;
}

function taskLabel(task: StrategyTask, index: number) {
  return `${index + 1}. ${task.title}`;
}

function explicitEvidenceRefs(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split("\n")
    .map((reference) => reference.trim())
    .filter((reference) => {
      if (!reference || seen.has(reference)) return false;
      seen.add(reference);
      return true;
    });
}

export function StrategyReview() {
  const queryClient = useQueryClient();
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [ownerReason, setOwnerReason] = useState("");
  const [ownerEvidence, setOwnerEvidence] = useState("");
  const strategy = useQuery({
    queryKey: queryKeys.agentStrategy,
    queryFn: () => apiGet<StrategyReviewResponse>("/api/agent/strategy"),
  });
  const review = useMutation({
    mutationFn: (operation: ReviewOperation) =>
      apiPost<StrategyReviewResponse>("/api/agent/strategy", operation),
    onSuccess: (result, operation) => {
      queryClient.setQueryData(queryKeys.agentStrategy, result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      setPendingRemoval(null);
      setOwnerReason("");
      setOwnerEvidence("");
      toast.success(
        operation.operation === "approve"
          ? "Plan approved."
          : operation.operation === "remove"
            ? "Future task removed. Completed work was unchanged."
            : "Future plan order updated.",
      );
    },
    onError: (error) => {
      void strategy.refetch();
      toast.danger(getErrorMessage(error, "Could not update the future plan."));
    },
  });

  const data = strategy.data;
  const reason = ownerReason.trim();
  const evidenceRefs = explicitEvidenceRefs(ownerEvidence);
  const evidenceIsValid =
    evidenceRefs.length <= 20 && evidenceRefs.every((reference) => reference.length <= 300);
  const canRecordDecision = reason.length >= 3 && reason.length <= 500 && evidenceIsValid;

  function moveTask(index: number, offset: -1 | 1) {
    if (!data || review.isPending) return;
    const destination = index + offset;
    if (destination < 0 || destination >= data.tasks.length) return;
    const taskIds = data.tasks.map((task) => task.id);
    [taskIds[index], taskIds[destination]] = [taskIds[destination]!, taskIds[index]!];
    review.mutate({
      operation: "reorder",
      expectedPlanId: data.plan.id,
      taskIds,
      reason,
      evidenceRefs,
    });
  }

  function removeTask(task: StrategyTask) {
    if (!data || review.isPending) return;
    review.mutate({
      operation: "remove",
      expectedPlanId: data.plan.id,
      taskId: task.id,
      reason,
      evidenceRefs,
    });
  }

  function approvePlan() {
    if (!data || review.isPending) return;
    review.mutate({
      operation: "approve",
      planId: data.plan.id,
      reason,
      evidenceRefs,
    });
  }

  if (strategy.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  if (!data) {
    return (
      <Card role="alert">
        <Card.Header>
          <Card.Title>Plan unavailable</Card.Title>
          <Card.Description>Claudia could not load the current strategy for review.</Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button variant="outline" onPress={() => strategy.refetch()}>Try Again</Button>
        </Card.Footer>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header className="gap-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Card.Title>Strategy Review</Card.Title>
            <Card.Description className="mt-1 max-w-3xl">{data.plan.rationale}</Card.Description>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-sm font-medium text-foreground tabular-nums">Plan v{data.plan.version}</p>
            {data.plan.approvedAt ? (
              <ToneText tone="success" className="text-xs">Approved {DATE_TIME_FORMATTER.format(new Date(data.plan.approvedAt))}</ToneText>
            ) : (
              <ToneText tone="warning" className="text-xs">Awaiting review</ToneText>
            )}
          </div>
        </div>
        <p className="text-xs leading-5 text-muted tabular-nums">
          {DATE_FORMATTER.format(new Date(data.plan.windowStart))} – {DATE_FORMATTER.format(new Date(data.plan.windowEnd))}
        </p>
      </Card.Header>

      <Card.Content className="p-0">
        {data.tasks.length === 0 ? (
          <div className="px-6 py-8">
            <p className="text-sm font-medium text-foreground">No future tasks to review</p>
            <p className="mt-1 text-sm leading-6 text-muted">Claudia has no planned, scheduled, or waiting work in this plan.</p>
          </div>
        ) : (
          <ol className="divide-y divide-separator" aria-label="Ordered future plan">
            {data.tasks.map((task, index) => {
              const confirmRemoval = pendingRemoval === task.id;
              return (
                <li key={task.id} className="px-6 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="text-sm font-semibold leading-6 text-foreground">{taskLabel(task, index)}</h3>
                        <StatusText status={task.status} className="text-xs" />
                      </div>
                      <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                        <div className="sm:col-span-2 xl:col-span-3">
                          <p className="text-xs text-muted">Why and evidence</p>
                          <p className="mt-1 text-sm leading-6 text-foreground">{task.reason}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Expected impact</p>
                          <p className="mt-1 text-sm leading-6 text-foreground">{task.expectedImpact ?? "Not estimated"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Confidence</p>
                          <p className="mt-1 text-sm font-medium text-foreground tabular-nums">{task.confidence}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Risk and authority</p>
                          <p className="mt-1 text-sm">
                            <ToneText tone={riskTone(task.riskLevel)} className="text-sm">{titleCase(task.riskLevel)} risk</ToneText>
                            <span className="text-muted"> · {titleCase(task.requiredAuthority)}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Dependencies</p>
                          <p className="mt-1 break-words text-sm leading-6 text-foreground">
                            {task.dependencies.length > 0 ? task.dependencies.join(", ") : "None"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Stop conditions</p>
                          <p className="mt-1 text-sm leading-6 text-foreground">
                            {task.stopConditions.length > 0 ? task.stopConditions.join("; ") : "Objective and system limits"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted">Scheduled</p>
                          <p className="mt-1 text-sm leading-6 text-foreground tabular-nums">
                            {task.scheduledFor ? DATE_TIME_FORMATTER.format(new Date(task.scheduledFor)) : "Not scheduled"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 xl:max-w-64 xl:justify-end">
                      {confirmRemoval ? (
                        <>
                          <span className="w-full text-xs leading-5 text-danger xl:text-right">Remove this future task?</span>
                          <Button size="sm" variant="ghost" onPress={() => setPendingRemoval(null)}>Keep task</Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="min-h-10 text-danger active:scale-[0.96] transition-transform"
                            isDisabled={review.isPending || !canRecordDecision}
                            onPress={() => removeTask(task)}
                          >
                            <XIcon className="size-4" />
                            Remove task
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-10 active:scale-[0.96] transition-transform"
                            isDisabled={index === 0 || review.isPending || !canRecordDecision}
                            onPress={() => moveTask(index, -1)}
                          >
                            <ArrowUpIcon className="size-4" />
                            Move earlier
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-10 active:scale-[0.96] transition-transform"
                            isDisabled={index === data.tasks.length - 1 || review.isPending || !canRecordDecision}
                            onPress={() => moveTask(index, 1)}
                          >
                            <ArrowDownIcon className="size-4" />
                            Move later
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="min-h-10 text-danger active:scale-[0.96] transition-transform"
                            isDisabled={review.isPending}
                            onPress={() => setPendingRemoval(task.id)}
                          >
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card.Content>

      <Card.Footer className="flex-col items-stretch gap-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <TextField
            fullWidth
            isRequired
            value={ownerReason}
            variant="secondary"
            onChange={setOwnerReason}
          >
            <Label>Reason for this decision</Label>
            <TextArea
              rows={3}
              maxLength={500}
              placeholder="Explain why this order, removal, or approval is right for the objective."
            />
            <Description>
              This owner-authored rationale is recorded with the plan revision.
            </Description>
          </TextField>
          <TextField
            fullWidth
            value={ownerEvidence}
            variant="secondary"
            onChange={setOwnerEvidence}
          >
            <Label>Evidence references (optional)</Label>
            <TextArea
              rows={3}
              maxLength={6_000}
              placeholder={"audit:record-id\nevent:record-id"}
            />
            <Description>
              One record reference per line. Leave blank when no record triggered the decision.
            </Description>
          </TextField>
        </div>
        {!evidenceIsValid ? (
          <p className="text-sm text-danger" role="alert">
            Use at most 20 evidence references, with no more than 300 characters per line.
          </p>
        ) : null}
        <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs leading-5 text-muted">
              Only future work can be reordered or removed here. Completed work and its evidence remain immutable in the work history.
            </p>
            <Link
              href="/settings?tab=advanced"
              className="mt-2 inline-block text-xs font-medium text-foreground underline-offset-4 hover-fine:underline"
            >
              Review or revoke live authority
            </Link>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <SteerClaudia label="Constrain or pause" size="sm" variant="outline" />
            <Button
              size="sm"
              className="min-h-10 active:scale-[0.96] transition-transform"
              isDisabled={Boolean(data.plan.approvedAt) || review.isPending || !canRecordDecision}
              isPending={review.isPending && review.variables?.operation === "approve"}
              onPress={approvePlan}
            >
              <CheckIcon className="size-4" />
              {data.plan.approvedAt ? "Plan approved" : "Approve plan"}
            </Button>
          </div>
        </div>
      </Card.Footer>
    </Card>
  );
}
