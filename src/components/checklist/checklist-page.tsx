"use client";

import {
  Button,
  Card,
  Disclosure,
  ScrollShadow,
  Skeleton,
  Tabs,
  toast,
} from "@heroui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  InlineCodeIcon,
} from "@/components/icons";
import { LoadingButton } from "@/components/ui/loading-button";
import { Section } from "@/components/feedback/section";
import { useProgressRouter } from "@/components/feedback/navigation-progress";
import { apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  combineQueries,
  queryKeys,
  useBrandProfile,
  useChecklist,
  type CompletedVisibilityFinding,
  type VisibilityFinding,
} from "@/lib/api/queries";
import { buildFixArtifact } from "@/lib/visibility/fix-artifact";
import { isInstallReady } from "@/lib/visibility/fix-policy";
import { buildFixPrompt, buildManualFixGuide } from "@/lib/visibility/fix-prompt";

type ChecklistView = "next" | "seo" | "aeo" | "geo" | "completed";

const CHECKLIST_VIEWS = new Set<ChecklistView>(["next", "seo", "aeo", "geo", "completed"]);
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pillarTextColor(pillar: VisibilityFinding["pillar"]) {
  if (pillar === "seo") return "text-success";
  if (pillar === "aeo") return "text-accent";
  return "text-warning";
}

function severityTextColor(severity: VisibilityFinding["severity"]) {
  if (severity === "critical" || severity === "high") return "text-danger";
  if (severity === "medium") return "text-warning";
  return "text-muted";
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

function ChecklistSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading checklist">
      <Skeleton className="h-12 w-full max-w-2xl rounded-xl" />
      {[0, 1, 2].map((item) => <Skeleton key={item} className="h-44 rounded-3xl" />)}
    </div>
  );
}

function invalidateChecklist(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.checklist });
  void queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSummary });
}

function OpenChecklistItem({
  finding,
  website,
  selected,
}: {
  finding: VisibilityFinding;
  website: string | null;
  selected: boolean;
}) {
  const [open, setOpen] = useState(selected);
  const queryClient = useQueryClient();
  const artifact = buildFixArtifact(finding.fixPayload);
  const hasArtifact = artifact.content.trim().length > 0;
  const prompt = buildFixPrompt(finding, website);
  const manualGuide = buildManualFixGuide(finding, website);
  const ready = isInstallReady(finding.fixCapability);
  const complete = useMutation({
    mutationFn: () => apiPatch("/api/visibility/findings", { findingId: finding.id, action: "complete" }),
    onSuccess: () => {
      invalidateChecklist(queryClient);
      posthog.capture("checklist_item_completed", { finding_id: finding.id, method: "manual" });
      toast.success("Marked complete. Claudia will verify the live site on her next check.");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't update this item.")),
  });
  const installed = useMutation({
    mutationFn: () => apiPost("/api/visibility/fix", { findingId: finding.id }),
    onSuccess: () => {
      invalidateChecklist(queryClient);
      posthog.capture("checklist_item_completed", { finding_id: finding.id, method: "installed" });
      toast.success("Marked installed. Claudia will verify the live site on her next check.");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't update this item.")),
  });

  return (
    <Card id={`checklist-${finding.id}`} className="scroll-mt-24 rounded-3xl p-0">
      <Disclosure
        isExpanded={open}
        onExpandedChange={(next) => {
          setOpen(next);
          if (next) posthog.capture("checklist_item_opened", { finding_id: finding.id, pillar: finding.pillar });
        }}
      >
        <div className="grid gap-5 p-6 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs font-medium">
              <span className={pillarTextColor(finding.pillar)}>
                {finding.pillar.toUpperCase()}
              </span>
              <span className="text-muted" aria-hidden>·</span>
              <span className={severityTextColor(finding.severity)}>
                {titleCase(finding.severity)} priority
              </span>
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-foreground text-pretty">
              {finding.title}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted text-pretty">
              {finding.recommendation}
            </p>
          </div>
          <Disclosure.Heading>
            <Button
              slot="trigger"
              className="min-h-10 transition-transform active:scale-[0.96]"
              size="sm"
              variant={open ? "ghost" : "outline"}
            >
              {open ? "Close" : "See exact fix"}
              {!open ? <ArrowRightIcon className="size-4" aria-hidden /> : null}
            </Button>
          </Disclosure.Heading>
        </div>

        <Disclosure.Content>
          <Disclosure.Body>
            <div className="grid gap-8 border-t border-separator px-6 py-7 sm:px-7 lg:grid-cols-[minmax(14rem,0.42fr)_minmax(0,0.58fr)]">
              <section aria-labelledby={`why-${finding.id}`}>
                <h3 id={`why-${finding.id}`} className="text-sm font-semibold text-foreground">
                  Why this matters
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted">{finding.recommendation}</p>
                <h3 className="mt-7 text-sm font-semibold text-foreground">How Claudia will verify it</h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  After you implement and mark this complete, Claudia will check the live website during the next assessment. It is not fixed until that check confirms the issue is gone.
                </p>
              </section>

              <section aria-labelledby={`fix-${finding.id}`}>
                <h3 id={`fix-${finding.id}`} className="text-sm font-semibold text-foreground">
                  Exact fix
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted">{artifact.instructions}</p>
                {hasArtifact ? (
                  <ScrollShadow className="mt-4 max-h-80 rounded-xl bg-surface-secondary p-4" hideScrollBar>
                    <pre className="overflow-x-auto text-xs leading-6 text-foreground"><code>{artifact.content}</code></pre>
                  </ScrollShadow>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {hasArtifact ? (
                    <Button className="min-h-10 transition-transform active:scale-[0.96]" size="sm" variant="outline" onPress={() => {
                      posthog.capture("checklist_fix_copied", { finding_id: finding.id, format: "artifact" });
                      void copyText(artifact.content);
                    }}>
                      <CopyIcon className="size-4 text-accent" aria-hidden />
                      Copy prepared fix
                    </Button>
                  ) : null}
                  {artifact.mode === "file" && artifact.filename ? (
                    <Button
                      className="min-h-10 transition-transform active:scale-[0.96]"
                      size="sm"
                      variant="outline"
                      onPress={() => downloadFile(artifact.filename!, artifact.content)}
                    >
                      <DownloadIcon className="size-4 text-success" aria-hidden />
                      Download {artifact.filename}
                    </Button>
                  ) : null}
                  <Button className="min-h-10 transition-transform active:scale-[0.96]" size="sm" variant="outline" onPress={() => {
                    posthog.capture("checklist_fix_copied", { finding_id: finding.id, format: "coding_agent" });
                    void copyText(prompt);
                  }}>
                    <InlineCodeIcon className="size-4 text-accent" aria-hidden />
                    Copy coding-agent prompt
                  </Button>
                  <Button className="min-h-10 transition-transform active:scale-[0.96]" size="sm" variant="outline" onPress={() => {
                    posthog.capture("checklist_fix_copied", { finding_id: finding.id, format: "manual" });
                    void copyText(manualGuide);
                  }}>
                    <CopyIcon className="size-4 text-success" aria-hidden />
                    Copy manual steps
                  </Button>
                </div>
                <LoadingButton
                  className="mt-7 min-h-11 transition-transform active:scale-[0.96]"
                  isPending={ready ? installed.isPending : complete.isPending}
                  onPress={() => (ready ? installed.mutate() : complete.mutate())}
                >
                  {ready ? "I installed this" : "Mark implemented"}
                </LoadingButton>
              </section>
            </div>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </Card>
  );
}

function CompletedChecklistItem({ finding }: { finding: CompletedVisibilityFinding }) {
  const queryClient = useQueryClient();
  const reopen = useMutation({
    mutationFn: () => apiPatch("/api/visibility/findings", { findingId: finding.id, action: "reopen" }),
    onSuccess: () => invalidateChecklist(queryClient),
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't reopen this item.")),
  });
  const verified = Boolean(finding.verifiedAt);

  return (
    <Card className="rounded-3xl p-0">
      <Card.Content className="grid gap-5 p-6 sm:p-7 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className={verified ? "text-xs font-medium text-success" : "text-xs font-medium text-warning"}>
            {verified ? "Verified on the live site" : "Completed · Verification pending"}
          </p>
          <h2 className="mt-3 text-lg font-semibold tracking-tight text-foreground">{finding.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {verified
              ? "Claudia checked the live website and confirmed the issue is gone."
              : "You marked this work complete. Claudia has not yet confirmed the live change."}
          </p>
          {finding.resolvedAt ? (
            <p className="mt-3 text-xs text-muted tabular-nums">
              Completed {DATE_FORMATTER.format(new Date(finding.resolvedAt))}
            </p>
          ) : null}
        </div>
        <LoadingButton
          className="min-h-10 transition-transform active:scale-[0.96]"
          size="sm"
          variant="ghost"
          isPending={reopen.isPending}
          onPress={() => reopen.mutate()}
        >
          Reopen
        </LoadingButton>
      </Card.Content>
    </Card>
  );
}

function EmptyChecklist({ completed }: { completed?: boolean }) {
  return (
    <Card className="rounded-3xl p-0">
      <Card.Content className="flex min-h-60 flex-col items-center justify-center px-6 py-12 text-center">
        <CheckIcon className="size-8 text-success" aria-hidden />
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
          {completed ? "No completed work yet" : "Nothing needs your attention here"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted">
          {completed
            ? "Completed work and its live verification status will collect here."
            : "Claudia will add an item when an assessment finds useful work."}
        </p>
      </Card.Content>
    </Card>
  );
}

function ChecklistContent() {
  const router = useProgressRouter();
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view") as ChecklistView | null;
  const selectedView = requestedView && CHECKLIST_VIEWS.has(requestedView) ? requestedView : "next";
  const selectedItem = searchParams.get("item");
  const checklist = useChecklist();
  const profile = useBrandProfile();
  const query = combineQueries(checklist, profile);

  useEffect(() => {
    posthog.capture("checklist_viewed", { view: selectedView });
  }, [selectedView]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-14 pt-8 sm:pt-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm font-medium text-muted">Checklist</p>
        <h1 className="type-display mt-3 text-balance text-5xl leading-[1.02] tracking-[-0.035em] text-foreground sm:text-6xl">
          Do these next.
        </h1>
        <p className="mt-5 max-w-[62ch] text-base leading-7 text-muted text-pretty">
          Claudia has combined your SEO, answer-readiness, and AI-discovery work into one prioritized list.
        </p>
      </header>

      <Section query={query} skeleton={<ChecklistSkeleton />} errorLabel="Couldn't load your checklist.">
        {([data, profileData]) => {
          const byPillar = {
            seo: data.open.filter((finding) => finding.pillar === "seo"),
            aeo: data.open.filter((finding) => finding.pillar === "aeo"),
            geo: data.open.filter((finding) => finding.pillar === "geo"),
          };
          const visible = selectedView === "next"
            ? data.open.slice(0, 5)
            : selectedView === "completed"
              ? []
              : byPillar[selectedView];
          const website = profileData.profile.website?.trim() || null;

          return (
            <Tabs
              variant="secondary"
              selectedKey={selectedView}
              onSelectionChange={(key) => {
                const view = String(key) as ChecklistView;
                router.replace(view === "next" ? "/checklist" : `/checklist?view=${view}`, {
                  scroll: false,
                });
              }}
            >
              <Tabs.ListContainer className="w-fit max-w-full">
                <Tabs.List aria-label="Checklist views">
                  <Tabs.Tab id="next">Do these next<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="seo">SEO<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="aeo">AEO<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="geo">GEO<Tabs.Indicator /></Tabs.Tab>
                  <Tabs.Tab id="completed">Completed<Tabs.Indicator /></Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              {(["next", "seo", "aeo", "geo"] as const).map((view) => (
                <Tabs.Panel key={view} id={view} className="pt-6">
                  {selectedView === view ? (
                    visible.length > 0 ? (
                      <div className="space-y-4">
                        {visible.map((finding) => (
                          <OpenChecklistItem
                            key={finding.id}
                            finding={finding}
                            website={website}
                            selected={selectedItem === finding.id}
                          />
                        ))}
                      </div>
                    ) : <EmptyChecklist />
                  ) : null}
                </Tabs.Panel>
              ))}

              <Tabs.Panel id="completed" className="pt-6">
                {selectedView === "completed" ? (
                  data.completed.length > 0 ? (
                    <div className="space-y-4">
                      {data.completed.map((finding) => <CompletedChecklistItem key={finding.id} finding={finding} />)}
                    </div>
                  ) : <EmptyChecklist completed />
                ) : null}
              </Tabs.Panel>
            </Tabs>
          );
        }}
      </Section>
    </main>
  );
}

export function ChecklistPage() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-7xl px-5 py-12"><ChecklistSkeleton /></main>}>
      <ChecklistContent />
    </Suspense>
  );
}
