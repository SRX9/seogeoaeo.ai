"use client";

import {
  Button,
  Card,
  Description,
  Label,
  ListBox,
  Select,
  Skeleton,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangleIcon, CheckIcon, LayersIcon, XIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { LoadingButton } from "@/components/ui/loading-button";
import type {
  MemoryContradictionView,
  MemoryPropagationIssueView,
} from "@/lib/agent/memory-corrections";
import { apiGet, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/query-keys";

type MemoryCorrectionInboxResponse = {
  contradictions: MemoryContradictionView[];
  contradictionOverflow: boolean;
  propagationIssues: MemoryPropagationIssueView[];
};

type ResolutionRequest = {
  operation: "resolve_conflict";
  contradictionGroup: string;
  subjectKey: string;
  targetRecordId: string;
  expectedRecords: Array<{ id: string; lifecycleVersion: number }>;
  correctedStatement: string;
  reason: string;
};

type ResolutionResponse = {
  correctionId: string;
  supersededRecordIds: string[];
  invalidatedSummaryIds: string[];
  propagation: {
    status: "applied" | "pending" | "in_progress" | "dead_letter";
    error: string | null;
  };
};

type ResolutionDraft = {
  contradictionGroup: string;
  targetRecordId: string;
  correctedStatement: string;
  reason: string;
};

const observedFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function subjectLabel(subjectKey: string) {
  return subjectKey.replace(/[._:-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function creatorLabel(creator: string) {
  if (creator === "owner") return "Owner";
  if (creator === "verified_tool") return "Verified tool";
  if (creator === "model_inference") return "Model inference";
  return "System";
}

function recordOptionLabel(record: MemoryContradictionView["records"][number]) {
  const statement = record.statement.length > 80
    ? `${record.statement.slice(0, 77)}…`
    : record.statement;
  return `${creatorLabel(record.creator)}: ${statement}`;
}

function ConflictRecords({ conflict }: { conflict: MemoryContradictionView }) {
  return (
    <div className="divide-y divide-separator" aria-label="Conflicting memory records">
      {conflict.records.map((record) => (
        <div key={record.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <ToneText
              tone={record.creator === "owner" ? "accent" : "default"}
              className="text-xs"
            >
              {creatorLabel(record.creator)}
            </ToneText>
            <span className="text-xs tabular-nums text-muted">
              {record.confidence}% confidence · {observedFormatter.format(new Date(record.observedAt))}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-foreground">{record.statement}</p>
          <p className="mt-1 truncate text-xs text-muted" title={record.sourceRef}>
            Source: {record.sourceRef}
          </p>
        </div>
      ))}
    </div>
  );
}

function ResolutionForm({
  conflict,
  draft,
  isPending,
  onChange,
  onCancel,
  onSubmit,
}: {
  conflict: MemoryContradictionView;
  draft: ResolutionDraft;
  isPending: boolean;
  onChange: (draft: ResolutionDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const canSubmit =
    draft.correctedStatement.trim().length > 0 &&
    draft.correctedStatement.trim().length <= 2_000 &&
    draft.reason.trim().length >= 3 &&
    draft.reason.trim().length <= 1_000;
  return (
    <div className="mt-5 space-y-4" aria-label={`Resolve ${subjectLabel(conflict.subjectKey)}`}>
      <Select
        fullWidth
        aria-label="Belief being corrected"
        value={draft.targetRecordId}
        variant="secondary"
        onChange={(value) => onChange({ ...draft, targetRecordId: String(value) })}
      >
        <Label>Belief being corrected</Label>
        <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
        <Select.Popover>
          <ListBox>
            {conflict.records.map((record) => (
              <ListBox.Item key={record.id} id={record.id} textValue={recordOptionLabel(record)}>
                {recordOptionLabel(record)}<ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <TextField
        fullWidth
        isRequired
        value={draft.correctedStatement}
        variant="secondary"
        onChange={(value) => onChange({ ...draft, correctedStatement: value })}
      >
        <Label>Correct value</Label>
        <TextArea rows={3} maxLength={2_000} placeholder="Enter the value Claudia should use from now on." />
        <Description>The correction takes effect immediately and preserves the prior values in history.</Description>
      </TextField>
      <TextField
        fullWidth
        isRequired
        value={draft.reason}
        variant="secondary"
        onChange={(value) => onChange({ ...draft, reason: value })}
      >
        <Label>Why this is correct</Label>
        <TextArea rows={2} maxLength={1_000} placeholder="Name the owner decision or first-party source." />
      </TextField>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          className="min-h-10 active:scale-[0.96] transition-transform"
          isDisabled={isPending}
          onPress={onCancel}
        >
          <XIcon className="size-4" />
          Cancel
        </Button>
        <LoadingButton
          className="min-h-10 active:scale-[0.96] transition-transform"
          isDisabled={!canSubmit}
          isPending={isPending}
          onPress={onSubmit}
        >
          <CheckIcon className="size-4" />
          {isPending ? "Saving…" : "Use correction"}
        </LoadingButton>
      </div>
    </div>
  );
}

export function MemoryConflictResolver() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ResolutionDraft | null>(null);
  const inbox = useQuery({
    queryKey: queryKeys.agentMemoryCorrections,
    queryFn: () =>
      apiGet<MemoryCorrectionInboxResponse>("/api/agent/memory/corrections"),
  });
  const resolveConflict = useMutation({
    mutationFn: (request: ResolutionRequest) =>
      apiPost<ResolutionResponse>("/api/agent/memory/corrections", request),
    onSuccess: (result) => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentMemoryCorrections });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentStrategy });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
      if (result.propagation.status === "applied") {
        toast.success("Correction saved and future work refreshed.");
      } else {
        toast.warning("Correction saved. Future work will refresh automatically.");
      }
    },
    onError: (error) => {
      void inbox.refetch();
      toast.danger(getErrorMessage(error, "Could not resolve the memory conflict."));
    },
  });

  if (inbox.isLoading) {
    return <Skeleton className="h-36 w-full rounded-2xl" aria-label="Loading memory conflicts" />;
  }
  if (inbox.error) {
    return (
      <Card role="alert">
        <Card.Header>
          <Card.Title>Couldn&apos;t Load Memory Conflicts</Card.Title>
          <Card.Description>Try the request again before approving dependent work.</Card.Description>
        </Card.Header>
        <Card.Footer>
          <LoadingButton variant="outline" isPending={inbox.isFetching} onPress={() => inbox.refetch()}>Try Again</LoadingButton>
        </Card.Footer>
      </Card>
    );
  }

  const data = inbox.data;
  if (
    !data ||
    (!data.contradictionOverflow &&
      data.contradictions.length === 0 &&
      data.propagationIssues.length === 0)
  ) {
    return null;
  }

  function beginResolution(conflict: MemoryContradictionView) {
    const inferred = conflict.records.find((record) => record.creator === "model_inference");
    setDraft({
      contradictionGroup: conflict.contradictionGroup,
      targetRecordId: inferred?.id ?? conflict.records[0]?.id ?? "",
      correctedStatement: "",
      reason: "",
    });
  }

  function submit(conflict: MemoryContradictionView) {
    if (!draft || draft.contradictionGroup !== conflict.contradictionGroup) return;
    resolveConflict.mutate({
      operation: "resolve_conflict",
      contradictionGroup: conflict.contradictionGroup,
      subjectKey: conflict.subjectKey,
      targetRecordId: draft.targetRecordId,
      expectedRecords: conflict.records.map((record) => ({
        id: record.id,
        lifecycleVersion: record.lifecycleVersion,
      })),
      correctedStatement: draft.correctedStatement.trim(),
      reason: draft.reason.trim(),
    });
  }

  return (
    <Card className="p-0">
      <Card.Header className="px-5 pt-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center text-warning" aria-hidden>
            <LayersIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <Card.Title>Memory Review</Card.Title>
            <Card.Description className="mt-1">
              Resolve conflicting facts before Claudia uses them in future work.
            </Card.Description>
          </div>
        </div>
      </Card.Header>

      {data.propagationIssues.length > 0 ? (
        <div className="mx-5 mt-4 space-y-2 text-sm text-danger" role="alert">
          {data.propagationIssues.map((issue) => (
            <p key={issue.markerId}>
              The correction for {subjectLabel(issue.subjectKey)} did not reach future plans after {issue.attemptCount} attempts: {issue.error}
            </p>
          ))}
        </div>
      ) : null}

      {data.contradictionOverflow ? (
        <p className="mx-5 mt-4 text-sm leading-6 text-danger" role="alert">
          The active memory conflict set exceeds the safe review limit. Dynamic work is blocked until an operator reduces the conflicting records.
        </p>
      ) : null}

      <div className="mt-3 divide-y divide-separator">
        {data.contradictions.map((conflict) => {
          const isEditing = draft?.contradictionGroup === conflict.contradictionGroup;
          return (
            <article key={conflict.contradictionGroup} className="px-5 py-5 first:pt-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-medium text-foreground">{subjectLabel(conflict.subjectKey)}</h3>
                    <ToneText tone={conflict.blocked ? "danger" : "warning"} className="text-xs">
                      {conflict.blocked ? "Dependent work blocked" : "Owner decision needed"}
                    </ToneText>
                  </div>
                  {conflict.blockedReason ? (
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-danger">
                      {conflict.blockedReason}
                    </p>
                  ) : null}
                </div>
                {!isEditing ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-10 shrink-0 active:scale-[0.96] transition-transform"
                    onPress={() => beginResolution(conflict)}
                  >
                    <AlertTriangleIcon className="size-4" />
                    Resolve conflict
                  </Button>
                ) : null}
              </div>
              <div className="mt-4">
                <ConflictRecords conflict={conflict} />
              </div>
              {isEditing && draft ? (
                <ResolutionForm
                  conflict={conflict}
                  draft={draft}
                  isPending={resolveConflict.isPending}
                  onChange={setDraft}
                  onCancel={() => setDraft(null)}
                  onSubmit={() => submit(conflict)}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </Card>
  );
}
