"use client";

import { Button, Card, Disclosure, ListBox, ScrollShadow, Select, Skeleton, Tooltip, toast } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CircleCheckIcon, RefreshIcon } from "@/components/icons";
import { ToneText } from "@/components/ui/status-text";
import { Section } from "@/components/feedback/section";
import { apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import { queryKeys, useBrandProfile, useVisibilityFindings, type VisibilityFinding } from "@/lib/api/queries";
import { buildFixArtifact } from "@/lib/visibility/fix-artifact";
import { isInstallReady } from "@/lib/visibility/fix-policy";
import { buildFixPrompt } from "@/lib/visibility/fix-prompt";

type Severity = VisibilityFinding["severity"];
type QueueState = "all" | "ready" | "guided";
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const EMPTY_FINDINGS: VisibilityFinding[] = [];

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function websiteLabel(website: string | null) {
  if (!website) return "Your website";
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function severityColor(severity: Severity): "danger" | "warning" | "default" {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "default";
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard.");
}

function downloadFile(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function QueueSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select aria-label={label} className="w-full sm:w-48" value={value} onChange={(key) => onChange(String(key))}>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function QueueSkeleton() {
  return <div className="space-y-3" aria-label="Loading fix queue">{[0,1,2,3].map((row)=><Skeleton className="h-28 rounded-2xl" key={row} />)}</div>;
}

function FixDetail({ finding, website }: { finding: VisibilityFinding; website: string | null }) {
  const artifact = buildFixArtifact(finding.fixPayload);
  const prompt = buildFixPrompt(finding, website);
  const hasArtifact = artifact.content.trim().length > 0;
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSummary });
    void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
  };
  const resolve = useMutation({
    mutationFn: (action: "dismiss" | "complete") => apiPatch("/api/visibility/findings", { findingId: finding.id, action }),
    onSuccess: invalidate,
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't update this finding.")),
  });
  const markInstalled = useMutation({
    mutationFn: () => apiPost("/api/visibility/fix", { findingId: finding.id }),
    onSuccess: () => { invalidate(); toast.success("Marked installed. Claudia will verify it on the next check."); },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't update this finding.")),
  });

  return (
    <div className="grid gap-6 border-t border-separator pt-5 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
      <section>
        <h3 className="text-sm font-semibold text-foreground">Fix Details</h3>
        <dl className="mt-4 space-y-4">
          {[
            ["Capability", titleCase(finding.category)],
            ["Format", artifact.filename ?? titleCase(artifact.mode)],
            ["Issue", finding.title],
            ["Instructions", artifact.instructions],
          ].map(([label, value]) => (
            <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-sm leading-relaxed text-foreground">{value}</dd></div>
          ))}
        </dl>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-foreground">Suggested Fix</h3>
        {hasArtifact ? (
          <ScrollShadow className="mt-4 max-h-80 rounded-xl bg-surface-secondary p-4" hideScrollBar>
            <pre className="overflow-x-auto text-xs leading-relaxed text-foreground"><code>{artifact.content}</code></pre>
          </ScrollShadow>
        ) : (
          <p className="mt-4 rounded-xl bg-surface-secondary p-4 text-sm leading-relaxed text-foreground">{artifact.instructions}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {hasArtifact ? <Button size="sm" variant="secondary" onPress={() => void copyText(artifact.content)}>Copy Fix</Button> : null}
          {artifact.mode === "file" && artifact.filename ? <Button size="sm" variant="secondary" onPress={() => downloadFile(artifact.filename!, artifact.content)}>Download</Button> : null}
          <Button size="sm" variant="secondary" onPress={() => void copyText(prompt)}>Copy Prompt</Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {isInstallReady(finding.fixCapability) ? <Button size="sm" isPending={markInstalled.isPending} onPress={() => markInstalled.mutate()}>I Installed This</Button> : null}
          <Button size="sm" variant="ghost" isDisabled={resolve.isPending} onPress={() => resolve.mutate("complete")}>Mark Done</Button>
          <Button size="sm" variant="danger" isDisabled={resolve.isPending} onPress={() => resolve.mutate("dismiss")}>Dismiss</Button>
        </div>
      </section>
    </div>
  );
}

function FindingRow({ finding, website }: { finding: VisibilityFinding; website: string | null }) {
  const [open, setOpen] = useState(false);
  const ready = isInstallReady(finding.fixCapability);
  return (
    <Card>
      <Disclosure isExpanded={open} onExpandedChange={setOpen}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ToneText tone={severityColor(finding.severity)}>{titleCase(finding.severity)}</ToneText>
              <ToneText>{titleCase(finding.category)}</ToneText>
              <ToneText tone={ready ? "success" : "default"}>{ready ? "Ready to Apply" : "Guided Fix"}</ToneText>
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">{finding.title}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{finding.recommendation}</p>
          </div>
          <Disclosure.Heading>
            <Button slot="trigger" size="sm" variant="secondary">
              {open ? "Hide Fix" : "View Fix"}
              <Disclosure.Indicator />
            </Button>
          </Disclosure.Heading>
        </div>
        <Disclosure.Content>
          <Disclosure.Body>
            <FixDetail finding={finding} website={website} />
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </Card>
  );
}

function ClearQueue({ onRecheck, isPending }: { onRecheck: () => void; isPending: boolean }) {
  return (
    <Card>
      <EmptyState className="py-10">
        <EmptyState.Header>
          <EmptyState.Media variant="icon"><CircleCheckIcon className="text-success" aria-hidden /></EmptyState.Media>
          <EmptyState.Title>Fix Queue Is Clear</EmptyState.Title>
          <EmptyState.Description>All detected issues have been resolved or dismissed.</EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.Content>
          <Button variant="secondary" isPending={isPending} onPress={onRecheck}>Recheck With Claudia</Button>
        </EmptyState.Content>
      </EmptyState>
    </Card>
  );
}

export default function FixQueuePage() {
  const findingsQuery = useVisibilityFindings();
  const profile = useBrandProfile();
  const website = profile.data?.profile.website?.trim() || null;
  const queryClient = useQueryClient();
  const [capability, setCapability] = useState("all");
  const [state, setState] = useState<QueueState>("all");
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const recheck = useMutation({
    mutationFn: () => apiPost("/api/visibility/audit", {}),
    onSuccess: () => { toast.success("Claudia started a fresh visibility check."); window.setTimeout(() => queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings }), 4000); },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't start a recheck.")),
  });
  const findings = findingsQuery.data?.findings ?? EMPTY_FINDINGS;
  const categories = useMemo(() => Array.from(new Set(findings.map((finding) => finding.category))).sort(), [findings]);
  const counts = useMemo(() => Object.fromEntries(SEVERITIES.map((item) => [item, findings.filter((finding) => finding.severity === item).length])) as Record<Severity, number>, [findings]);
  const filtered = useMemo(() => findings.filter((finding) => {
    if (capability !== "all" && finding.category !== capability) return false;
    if (severity !== "all" && finding.severity !== severity) return false;
    const ready = isInstallReady(finding.fixCapability);
    if (state === "ready" && !ready) return false;
    if (state === "guided" && ready) return false;
    return true;
  }), [capability, findings, severity, state]);
  const resetFilters = () => { setCapability("all"); setState("all"); setSeverity("all"); };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 pb-10 pt-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="sr-only">Fix Queue</h1><p className="text-sm text-muted">{websiteLabel(website)} · {findings.length} open fixes</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{SEVERITIES.map((item)=><ToneText key={item} tone={severityColor(item)}>{titleCase(item)} <span className="tabular-nums">{counts[item]}</span></ToneText>)}</div></div>
        <div className="flex gap-2"><Button isPending={recheck.isPending} onPress={() => recheck.mutate()}><RefreshIcon className="size-4" aria-hidden />Recheck</Button><Tooltip delay={300}><Button isIconOnly variant="secondary" aria-label="Refresh fix queue" isDisabled={findingsQuery.isFetching} onPress={() => void findingsQuery.refetch()}><RefreshIcon className="size-4" /></Button><Tooltip.Content>Refresh fix queue</Tooltip.Content></Tooltip></div>
      </header>

      <Card variant="secondary">
        <Card.Content className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <QueueSelect
            label="Filter by capability"
            value={capability}
            onChange={setCapability}
            options={[{ value: "all", label: "All Capabilities" }, ...categories.map((category) => ({ value: category, label: titleCase(category) }))]}
          />
          <QueueSelect
            label="Filter by state"
            value={state}
            onChange={(value) => setState(value as QueueState)}
            options={[{ value: "all", label: "All States" }, { value: "ready", label: "Ready to Apply" }, { value: "guided", label: "Guided Fix" }]}
          />
          <QueueSelect
            label="Filter by severity"
            value={severity}
            onChange={(value) => setSeverity(value as Severity | "all")}
            options={[{ value: "all", label: "All Severities" }, ...SEVERITIES.map((item) => ({ value: item, label: titleCase(item) }))]}
          />
          {capability !== "all" || state !== "all" || severity !== "all" ? <Button variant="ghost" onPress={resetFilters}>Reset</Button> : null}
        </Card.Content>
      </Card>

      <Section query={findingsQuery} skeleton={<QueueSkeleton />} errorLabel="Couldn't load your fix queue.">
        {() => findings.length === 0 ? <ClearQueue onRecheck={() => recheck.mutate()} isPending={recheck.isPending} /> : filtered.length === 0 ? <Card><EmptyState className="py-10"><EmptyState.Header><EmptyState.Title>No Matching Fixes</EmptyState.Title><EmptyState.Description>Try another capability, state, or severity.</EmptyState.Description></EmptyState.Header><EmptyState.Content><Button size="sm" variant="secondary" onPress={resetFilters}>Reset Filters</Button></EmptyState.Content></EmptyState></Card> : <div className="space-y-4">{filtered.map((finding)=><FindingRow key={finding.id} finding={finding} website={website} />)}</div>}
      </Section>
    </main>
  );
}
