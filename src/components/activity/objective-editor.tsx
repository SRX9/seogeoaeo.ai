"use client";

import {
  Button,
  Card,
  Checkbox,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  TextArea,
  TextField,
  toast,
} from "@heroui/react";
import { Sheet } from "@heroui-pro/react";
import { LoadingButton } from "@/components/ui/loading-button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GaugeIcon, SaveIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import type {
  AgentMissionView,
  AgentObjectiveCapability,
  AgentObjectiveMetricId,
} from "@/lib/agent/types";
import { apiGet, apiPatch, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys } from "@/lib/api/queries";

const METRICS: Array<{
  id: AgentObjectiveMetricId;
  label: string;
  unit: string;
  direction: "increase" | "decrease";
}> = [
  {
    id: "ai_answer_share_percent",
    label: "Eligible AI answer share",
    unit: "%",
    direction: "increase",
  },
  {
    id: "qualified_non_brand_clicks",
    label: "Qualified non-brand clicks",
    unit: "clicks",
    direction: "increase",
  },
  {
    id: "critical_crawler_findings",
    label: "Open critical crawler findings",
    unit: "findings",
    direction: "decrease",
  },
  {
    id: "grounded_pages_published",
    label: "Grounded pages published",
    unit: "pages",
    direction: "increase",
  },
];

const CAPABILITIES: Array<{
  id: AgentObjectiveCapability;
  label: string;
  description: string;
}> = [
  { id: "observe", label: "Observe", description: "Read trusted records and measure progress." },
  { id: "prepare", label: "Prepare", description: "Draft plans and reversible proposals." },
  { id: "article.create", label: "Create articles", description: "Create new article drafts." },
  { id: "article.update", label: "Update articles", description: "Revise existing article content." },
  { id: "article.meta.update", label: "Update article metadata", description: "Change article titles and metadata." },
  { id: "article.schema.update", label: "Update article schema", description: "Change structured data on articles." },
  { id: "site.meta.update", label: "Update site metadata", description: "Change site-level metadata." },
  { id: "site.schema.update", label: "Update site schema", description: "Change site-level structured data." },
  { id: "robots.update", label: "Update robots rules", description: "Change crawler access instructions." },
  { id: "llms_txt.update", label: "Update llms.txt", description: "Change AI crawler guidance." },
  { id: "rollback.supported", label: "Use supported rollback", description: "Reverse a tool action when rollback exists." },
];

const OBSERVED_DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

type ObjectiveReplanStatus =
  | "completed"
  | "pending"
  | "superseded"
  | "not_required"
  | "dead_letter";

type ObjectiveResponse = {
  objective: AgentMissionView;
  replanStatus: ObjectiveReplanStatus;
  replanPending: boolean;
  replanError: string | null;
};

type ObjectiveUpdateResponse = ObjectiveResponse & {
  planDiff: { fromVersion: number; toVersion: number; movedTaskCount: number } | null;
};

type ObjectiveForm = {
  objective: string;
  metric: AgentObjectiveMetricId;
  baselineValue: string;
  baselineObservedAt: string;
  baselineSourceRefs: string;
  targetValue: string;
  horizonStartAt: string;
  horizonEndAt: string;
  priority: string;
  maxCredits: string;
  maxRemoteWrites: string;
  maxCostDollars: string;
  constraints: string;
  allowedCapabilities: AgentObjectiveCapability[];
  successCondition: string;
  stopCondition: string;
};

function localDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultDates() {
  const start = new Date();
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 90);
  return { start: localDateTime(start.toISOString()), end: localDateTime(end.toISOString()) };
}

function formFromObjective(objective: AgentMissionView): ObjectiveForm {
  const dates = defaultDates();
  return {
    objective: objective.objective,
    metric: objective.metric ?? "ai_answer_share_percent",
    baselineValue: String(objective.baseline?.value ?? 0),
    baselineObservedAt: localDateTime(objective.baseline?.observedAt ?? new Date().toISOString()),
    baselineSourceRefs: objective.baseline?.sourceRefs.join("\n") ?? "",
    targetValue: String(objective.target?.value ?? 10),
    horizonStartAt: localDateTime(objective.horizon?.startAt ?? dates.start),
    horizonEndAt: localDateTime(objective.horizon?.endAt ?? dates.end),
    priority: String(objective.priority),
    maxCredits: String(objective.budget?.maxCredits ?? 100),
    maxRemoteWrites: String(objective.budget?.maxRemoteWrites ?? 0),
    maxCostDollars: String((objective.budget?.maxCostCents ?? 0) / 100),
    constraints: objective.constraints.join("\n"),
    allowedCapabilities:
      objective.allowedCapabilities.length > 0
        ? objective.allowedCapabilities
        : ["observe", "prepare"],
    successCondition:
      objective.successCondition ?? "Reach the target within the configured horizon.",
    stopCondition:
      objective.stopCondition ?? "Stop when a budget, safety, or authority limit is reached.",
  };
}

function uniqueLines(value: string) {
  const seen = new Set<string>();
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      const key = line.toLowerCase();
      if (!line || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function numericValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateForm(form: ObjectiveForm): string | null {
  if (form.objective.trim().length < 3) return "Describe the objective in at least three characters.";
  if (uniqueLines(form.baselineSourceRefs).length === 0) return "Add at least one baseline source reference.";
  if (form.allowedCapabilities.length === 0) return "Keep at least one capability in the objective ceiling.";
  if (form.successCondition.trim().length < 3) return "Add a measurable success condition.";
  if (form.stopCondition.trim().length < 3) return "Add a clear stop condition.";

  const baseline = numericValue(form.baselineValue);
  const target = numericValue(form.targetValue);
  const priority = numericValue(form.priority);
  const credits = numericValue(form.maxCredits);
  const remoteWrites = numericValue(form.maxRemoteWrites);
  const costDollars = numericValue(form.maxCostDollars);
  if ([baseline, target, priority, credits, remoteWrites, costDollars].some((value) => value == null)) {
    return "Use valid numbers for the metric, priority, and budget fields.";
  }
  if (
    baseline! < 0 ||
    target! < 0 ||
    priority! < 0 ||
    priority! > 100 ||
    credits! < 0 ||
    remoteWrites! < 0 ||
    costDollars! < 0
  ) {
    return "Metric and budget values cannot be negative, and priority must be between 0 and 100.";
  }
  if (![priority, credits, remoteWrites].every(Number.isInteger)) {
    return "Priority, credits, and remote-write limits must be whole numbers.";
  }

  const metric = METRICS.find((item) => item.id === form.metric)!;
  if (metric.direction === "increase" && target! <= baseline!) {
    return "For this metric, the target must be greater than the baseline.";
  }
  if (metric.direction === "decrease" && target! >= baseline!) {
    return "For this metric, the target must be lower than the baseline.";
  }
  if (form.metric === "ai_answer_share_percent" && (baseline! > 100 || target! > 100)) {
    return "Answer-share values must be between 0 and 100 percent.";
  }

  const observedAt = new Date(form.baselineObservedAt).getTime();
  const startsAt = new Date(form.horizonStartAt).getTime();
  const endsAt = new Date(form.horizonEndAt).getTime();
  if ([observedAt, startsAt, endsAt].some(Number.isNaN)) return "Choose valid baseline and horizon dates.";
  if (endsAt <= startsAt) return "The horizon end must be after its start.";
  if (observedAt > endsAt) return "The baseline must be observed before the horizon ends.";
  return null;
}

function progressTone(status: AgentMissionView["progress"]["status"]) {
  if (status === "succeeded") return "success" as const;
  if (status === "expired" || status === "stopped") return "warning" as const;
  return status === "needs_configuration" ? "danger" as const : "accent" as const;
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: number | null, metric: AgentObjectiveMetricId | null) {
  if (value == null) return "Not measured";
  return metric === "ai_answer_share_percent" ? `${value}%` : value.toLocaleString();
}

export function ObjectiveEditor() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<ObjectiveForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const objectiveQuery = useQuery({
    queryKey: queryKeys.agentObjective,
    queryFn: () => apiGet<ObjectiveResponse>("/api/agent/objective"),
  });
  const updateObjective = useMutation({
    mutationFn: (current: ObjectiveForm) => {
      const objective = objectiveQuery.data?.objective;
      if (!objective) throw new Error("Objective unavailable");
      return apiPatch<ObjectiveUpdateResponse>("/api/agent/objective", {
        expectedVersion: objective.definitionVersion,
        definition: {
          objective: current.objective.trim(),
          metric: current.metric,
          baseline: {
            value: Number(current.baselineValue),
            observedAt: new Date(current.baselineObservedAt).toISOString(),
            sourceRefs: uniqueLines(current.baselineSourceRefs),
          },
          target: { value: Number(current.targetValue) },
          horizon: {
            startAt: new Date(current.horizonStartAt).toISOString(),
            endAt: new Date(current.horizonEndAt).toISOString(),
          },
          priority: Number(current.priority),
          budget: {
            maxCredits: Number(current.maxCredits),
            maxRemoteWrites: Number(current.maxRemoteWrites),
            maxCostCents: Math.round(Number(current.maxCostDollars) * 100),
          },
          constraints: uniqueLines(current.constraints),
          allowedCapabilities: current.allowedCapabilities,
          successCondition: current.successCondition.trim(),
          stopCondition: current.stopCondition.trim(),
        },
      });
    },
    onSuccess: (result) => {
      queryClient.setQueryData<ObjectiveResponse>(queryKeys.agentObjective, {
        objective: result.objective,
        replanStatus: result.replanStatus,
        replanPending: result.replanPending,
        replanError: result.replanError,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
      void queryClient.invalidateQueries({ queryKey: queryKeys.agentStrategy });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setIsOpen(false);
      setForm(null);
      if (result.replanStatus === "dead_letter") {
        toast.danger(
          result.replanError ??
            "Objective saved, but the plan refresh needs operator recovery.",
        );
      } else {
        toast.success(
          result.replanPending
            ? "Objective saved. Claudia will refresh the plan on the next run."
            : "Objective saved and the future plan was refreshed.",
        );
      }
    },
    onError: (error) => {
      void objectiveQuery.refetch();
      toast.danger(getErrorMessage(error, "Could not save the objective."));
    },
  });

  const objective = objectiveQuery.data?.objective;
  const metric = METRICS.find((item) => item.id === objective?.metric);

  function openEditor() {
    if (!objective) return;
    setForm(formFromObjective(objective));
    setFormError(null);
    setIsOpen(true);
  }

  function submit() {
    if (!form || updateObjective.isPending) return;
    const validationError = validateForm(form);
    setFormError(validationError);
    if (!validationError) updateObjective.mutate(form);
  }

  function setField<Key extends keyof ObjectiveForm>(key: Key, value: ObjectiveForm[Key]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFormError(null);
  }

  function toggleCapability(capability: AgentObjectiveCapability, selected: boolean) {
    if (!form) return;
    const next = selected
      ? [...form.allowedCapabilities, capability]
      : form.allowedCapabilities.filter((item) => item !== capability);
    setField("allowedCapabilities", [...new Set(next)]);
  }

  if (objectiveQuery.isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;

  if (!objective) {
    return (
      <Card role="alert">
        <Card.Header>
          <Card.Title>Objective unavailable</Card.Title>
          <Card.Description>Claudia could not load the current measurable objective.</Card.Description>
        </Card.Header>
        <Card.Footer>
          <LoadingButton variant="outline" isPending={objectiveQuery.isFetching} onPress={() => objectiveQuery.refetch()}>Try Again</LoadingButton>
        </Card.Footer>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Card.Header className="flex-row items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center text-accent" aria-hidden>
            <GaugeIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Card.Title>Measurable Objective</Card.Title>
                <Card.Description className="mt-1 max-w-3xl">{objective.objective}</Card.Description>
              </div>
              <Button className="shrink-0 active:scale-[0.96] transition-transform" variant="secondary" onPress={openEditor}>
                Edit objective
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className="text-xs text-muted">Metric</dt>
              <dd className="mt-1 text-sm font-medium text-foreground">{metric?.label ?? "Needs configuration"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Baseline → target</dt>
              <dd className="mt-1 text-sm font-medium text-foreground tabular-nums">
                {formatValue(objective.baseline?.value ?? null, objective.metric)} → {formatValue(objective.target?.value ?? null, objective.metric)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Current</dt>
              <dd className="mt-1 text-sm font-medium text-foreground tabular-nums">
                {formatValue(objective.progress.currentValue, objective.metric)}
              </dd>
              {objective.progress.measuredAt ? (
                <p className="mt-1 text-xs text-muted">
                  Observed {OBSERVED_DATE_FORMATTER.format(new Date(objective.progress.measuredAt))}
                </p>
              ) : null}
            </div>
            <div>
              <dt className="text-xs text-muted">Progress</dt>
              <dd className="mt-1">
                <ToneText tone={progressTone(objective.progress.status)}>
                  {titleCase(objective.progress.status)}
                  {objective.progress.progressPercent != null ? ` · ${objective.progress.progressPercent}%` : ""}
                </ToneText>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Priority and version</dt>
              <dd className="mt-1 text-sm font-medium text-foreground tabular-nums">
                {objective.priority}/100 · v{objective.definitionVersion}
              </dd>
            </div>
          </dl>
          {objectiveQuery.data?.replanStatus === "dead_letter" ? (
            <p className="mt-5 text-sm leading-5 text-danger" role="alert">
              Plan refresh stopped after repeated failures. {objectiveQuery.data.replanError ?? "Operator recovery is required before Claudia can retry it."}
            </p>
          ) : objectiveQuery.data?.replanPending ? (
            <p className="mt-5 text-sm leading-5 text-warning">
              The objective is saved. Its plan refresh is pending and will retry on the scheduled maintenance pass.
            </p>
          ) : null}
          <p className="mt-5 text-xs leading-5 text-muted">
            Capability choices are a ceiling only. They never grant authority; policy and approval checks still apply to every live action.
          </p>
        </Card.Content>
      </Card>

      <Sheet isDetached isHandleOnly isOpen={isOpen} onOpenChange={setIsOpen}>
        <Sheet.Backdrop variant="blur">
          <Sheet.Content className="mx-auto max-h-[94vh] max-w-3xl">
            <Sheet.Dialog>
              <Sheet.Handle />
              <Sheet.CloseTrigger />
              <Sheet.Header>
                <Sheet.Heading>Configure Objective</Sheet.Heading>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                  Define what Claudia should improve, how success is measured, and the limits that stop the work.
                </p>
              </Sheet.Header>
              <Sheet.Body className="space-y-6 overflow-y-auto pb-6">
                {form ? (
                  <>
                    {formError ? <p className="text-sm text-danger" role="alert">{formError}</p> : null}

                    <section className="space-y-4" aria-labelledby="objective-outcome-heading">
                      <h3 id="objective-outcome-heading" className="text-sm font-semibold text-foreground">Outcome and measure</h3>
                      <TextField fullWidth isRequired value={form.objective} variant="secondary" onChange={(value) => setField("objective", value)}>
                        <Label>Objective</Label>
                        <TextArea rows={3} maxLength={1_000} placeholder="Increase qualified discovery for the brand." />
                        <Description>One outcome Claudia can use to rank competing work.</Description>
                      </TextField>
                      <Select
                        fullWidth
                        aria-label="Objective metric"
                        value={form.metric}
                        variant="secondary"
                        onChange={(value) => setField("metric", String(value) as AgentObjectiveMetricId)}
                      >
                        <Label>Metric</Label>
                        <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            {METRICS.map((item) => (
                              <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
                                {item.label}<ListBox.ItemIndicator />
                              </ListBox.Item>
                            ))}
                          </ListBox>
                        </Select.Popover>
                      </Select>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField isRequired type="number" value={form.baselineValue} variant="secondary" onChange={(value) => setField("baselineValue", value)}>
                          <Label>Baseline</Label>
                          <Input min="0" step="any" />
                        </TextField>
                        <TextField isRequired type="number" value={form.targetValue} variant="secondary" onChange={(value) => setField("targetValue", value)}>
                          <Label>Target</Label>
                          <Input min="0" step="any" />
                        </TextField>
                      </div>
                      <TextField fullWidth isRequired type="datetime-local" value={form.baselineObservedAt} variant="secondary" onChange={(value) => setField("baselineObservedAt", value)}>
                        <Label>Baseline observed at</Label>
                        <Input />
                      </TextField>
                      <TextField fullWidth isRequired value={form.baselineSourceRefs} variant="secondary" onChange={(value) => setField("baselineSourceRefs", value)}>
                        <Label>Baseline source references</Label>
                        <TextArea rows={2} maxLength={4_000} placeholder="visibility-report:2026-07-14" />
                        <Description>One trusted record reference per line.</Description>
                      </TextField>
                    </section>

                    <section className="space-y-4" aria-labelledby="objective-horizon-heading">
                      <h3 id="objective-horizon-heading" className="text-sm font-semibold text-foreground">Horizon and priority</h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField isRequired type="datetime-local" value={form.horizonStartAt} variant="secondary" onChange={(value) => setField("horizonStartAt", value)}>
                          <Label>Starts</Label>
                          <Input />
                        </TextField>
                        <TextField isRequired type="datetime-local" value={form.horizonEndAt} variant="secondary" onChange={(value) => setField("horizonEndAt", value)}>
                          <Label>Ends</Label>
                          <Input />
                        </TextField>
                      </div>
                      <TextField isRequired className="max-w-52" type="number" value={form.priority} variant="secondary" onChange={(value) => setField("priority", value)}>
                        <Label>Priority</Label>
                        <Input min="0" max="100" step="1" />
                        <Description>0–100</Description>
                      </TextField>
                    </section>

                    <section className="space-y-4" aria-labelledby="objective-budget-heading">
                      <div>
                        <h3 id="objective-budget-heading" className="text-sm font-semibold text-foreground">Budget ceiling</h3>
                        <p className="mt-1 text-xs leading-5 text-muted">These limits stop execution; they do not authorize spending or remote writes.</p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <TextField isRequired type="number" value={form.maxCredits} variant="secondary" onChange={(value) => setField("maxCredits", value)}>
                          <Label>Credits</Label>
                          <Input min="0" step="1" />
                        </TextField>
                        <TextField isRequired type="number" value={form.maxRemoteWrites} variant="secondary" onChange={(value) => setField("maxRemoteWrites", value)}>
                          <Label>Remote writes</Label>
                          <Input min="0" step="1" />
                        </TextField>
                        <TextField isRequired type="number" value={form.maxCostDollars} variant="secondary" onChange={(value) => setField("maxCostDollars", value)}>
                          <Label>External spend (USD)</Label>
                          <Input min="0" step="0.01" />
                        </TextField>
                      </div>
                    </section>

                    <section className="space-y-4" aria-labelledby="objective-guardrails-heading">
                      <div>
                        <h3 id="objective-guardrails-heading" className="text-sm font-semibold text-foreground">Constraints and capability ceiling</h3>
                        <p className="mt-1 text-xs leading-5 text-muted">Capabilities narrow the plan. Policy, safety, and approval checks remain mandatory.</p>
                      </div>
                      <TextField fullWidth value={form.constraints} variant="secondary" onChange={(value) => setField("constraints", value)}>
                        <Label>Constraints</Label>
                        <TextArea rows={3} maxLength={10_000} placeholder="Do not change pricing pages.&#10;Prefer evidence published within 12 months." />
                        <Description>One durable constraint per line.</Description>
                      </TextField>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {CAPABILITIES.map((capability) => (
                          <Checkbox
                            key={capability.id}
                            aria-label={capability.label}
                            isSelected={form.allowedCapabilities.includes(capability.id)}
                            variant="secondary"
                            onChange={(selected) => toggleCapability(capability.id, selected)}
                          >
                            <Checkbox.Content className="items-start gap-3">
                              <Checkbox.Control className="mt-0.5 shrink-0"><Checkbox.Indicator /></Checkbox.Control>
                              <span>
                                <span className="block text-sm font-medium text-foreground">{capability.label}</span>
                                <span className="mt-0.5 block text-xs leading-5 text-muted">{capability.description}</span>
                              </span>
                            </Checkbox.Content>
                          </Checkbox>
                        ))}
                      </div>
                    </section>

                    <section className="grid gap-4 sm:grid-cols-2" aria-label="Success and stop conditions">
                      <TextField fullWidth isRequired value={form.successCondition} variant="secondary" onChange={(value) => setField("successCondition", value)}>
                        <Label>Success condition</Label>
                        <TextArea rows={4} maxLength={2_000} placeholder="Reach the target before the horizon ends." />
                      </TextField>
                      <TextField fullWidth isRequired value={form.stopCondition} variant="secondary" onChange={(value) => setField("stopCondition", value)}>
                        <Label>Stop condition</Label>
                        <TextArea rows={4} maxLength={2_000} placeholder="Stop if budget, authority, or safety limits are reached." />
                      </TextField>
                    </section>
                  </>
                ) : null}
              </Sheet.Body>
              <Sheet.Footer>
                <Button variant="ghost" onPress={() => setIsOpen(false)}>Cancel</Button>
                <LoadingButton isDisabled={!form} isPending={updateObjective.isPending} onPress={submit}>
                  <SaveIcon className="size-4" />
                  {updateObjective.isPending ? "Saving…" : "Save objective"}
                </LoadingButton>
              </Sheet.Footer>
            </Sheet.Dialog>
          </Sheet.Content>
        </Sheet.Backdrop>
      </Sheet>
    </>
  );
}
