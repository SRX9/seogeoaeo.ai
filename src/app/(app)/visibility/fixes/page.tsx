"use client";

import { Button, Card, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { EmptyState } from "@heroui-pro/react/empty-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { CircleCheckIcon } from "@/components/icons";
import { Section } from "@/components/feedback/section";
import { TableSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  useBrandProfile,
  useVisibilityFindings,
  type VisibilityFinding,
} from "@/lib/api/queries";
import { PILLAR_LABELS } from "@/lib/visibility/display";
import { buildFixArtifact } from "@/lib/visibility/fix-artifact";
import { isInstallReady } from "@/lib/visibility/fix-policy";
import { buildFixPrompt } from "@/lib/visibility/fix-prompt";

/**
 * V8.2 — the fix queue: one severity-ranked list of every open finding. Each
 * row opens into the actual fix: a paste-ready snippet/file when we generated
 * one, a "mark as installed" control after the owner deploys it, and — always —
 * a copy-paste prompt for the owner's AI coding assistant.
 */

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const SEVERITY_DOT: Record<(typeof SEVERITIES)[number], string> = {
  critical: "bg-danger",
  high: "bg-warning",
  medium: "bg-accent",
  low: "bg-default-300",
};
const SEVERITY_HINT: Record<(typeof SEVERITIES)[number], string> = {
  critical: "fix these first",
  high: "big score impact",
  medium: "worth doing soon",
  low: "nice to have",
};

/** Copy-to-clipboard button with a transient "Copied" confirmation. */
function CopyButton({
  text,
  label,
  variant = "secondary",
}: {
  text: string;
  label: string;
  variant?: "primary" | "secondary" | "outline";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant={variant}
      onPress={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access denied — nothing to do, button stays unchanged
        }
      }}
    >
      {copied ? "Copied ✓" : label}
    </Button>
  );
}

function downloadFile(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** The expanded fix panel: the artifact (if any) + the AI-assistant prompt. */
function FixDetail({ finding, website }: { finding: VisibilityFinding; website: string | null }) {
  const artifact = buildFixArtifact(finding.fixPayload);
  const prompt = buildFixPrompt(finding, website);
  const hasArtifact = artifact.content.trim().length > 0;

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      {hasArtifact && (
        <div className="space-y-2">
          <p className="text-sm font-medium">The fix, ready to use</p>
          <p className="text-sm text-default-500">{artifact.instructions}</p>
          <pre className="max-h-72 overflow-auto rounded-lg bg-default-100 p-3 text-xs">
            {artifact.content}
          </pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={artifact.content} label="Copy fix" />
            {artifact.mode === "file" && artifact.filename && (
              <Button
                size="sm"
                variant="secondary"
                onPress={() => downloadFile(artifact.filename!, artifact.content)}
              >
                Download {artifact.filename}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2 rounded-2xl border border-border/50 bg-surface-muted/80 p-3.5">
        <p className="text-sm font-medium tracking-tight">Fix it with your AI coding assistant</p>
        <p className="text-sm leading-relaxed text-default-500">
          Copy this prompt and paste it into Cursor, Claude Code, or Copilot inside your
          website&apos;s project — it tells the assistant exactly what to change and how to verify
          it.
        </p>
        <CopyButton text={prompt} label="Copy prompt" variant="primary" />
      </div>
    </div>
  );
}

function FindingCard({ finding, website }: { finding: VisibilityFinding; website: string | null }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings });
    void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSummary });
    void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
  };

  const resolve = useMutation({
    mutationFn: (action: "dismiss" | "complete") =>
      apiPatch("/api/visibility/findings", { findingId: finding.id, action }),
    onSuccess: invalidate,
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't update this finding.")),
  });
  const markInstalled = useMutation({
    mutationFn: () => apiPost("/api/visibility/fix", { findingId: finding.id }),
    onSuccess: () => {
      invalidate();
      toast.success("Marked installed — Claudia will re-check on the next audit.");
    },
    onError: (error) => toast.danger(getErrorMessage(error, "Couldn't update this finding.")),
  });

  const hasReadyFix = isInstallReady(finding.fixCapability);

  return (
    <Card className="material-panel p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.01em] text-default-400">
            {PILLAR_LABELS[finding.pillar]}
          </p>
          <p className="font-medium tracking-tight">{finding.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-default-500">
            {finding.recommendation}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            onPress={() => setOpen(!open)}
          >
            {open ? "Hide fix" : hasReadyFix ? "Show fix" : "How to fix"}
          </Button>
          {hasReadyFix && (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={markInstalled.isPending}
              onPress={() => markInstalled.mutate()}
            >
              {markInstalled.isPending ? "Saving…" : "I installed this"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            isDisabled={resolve.isPending}
            onPress={() => resolve.mutate("complete")}
          >
            Done
          </Button>
          <Button
            size="sm"
            variant="outline"
            isDisabled={resolve.isPending}
            onPress={() => resolve.mutate("dismiss")}
          >
            Dismiss
          </Button>
        </div>
      </div>
      {markInstalled.isError && (
        <p className="mt-2 text-sm text-danger">Couldn&apos;t update this finding — try again.</p>
      )}
      {open && <FixDetail finding={finding} website={website} />}
    </Card>
  );
}

function FindingsList({
  findings,
  website,
}: {
  findings: VisibilityFinding[];
  website: string | null;
}) {
  if (findings.length === 0) {
    return (
      <EmptyState className="material-panel rounded-2xl border-dashed">
        <EmptyState.Header>
          <EmptyState.Media variant="icon">
            <CircleCheckIcon />
          </EmptyState.Media>
          <EmptyState.Title>Your fix queue is clear</EmptyState.Title>
          <EmptyState.Description>
            No open findings right now. Run an audit and anything worth fixing lands here,
            ranked by how much it moves your score.
          </EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.Content>
          <Link
            href="/visibility"
            className={buttonVariants({ size: "sm", variant: "secondary" })}
          >
            Open visibility
          </Link>
        </EmptyState.Content>
      </EmptyState>
    );
  }

  return (
    <>
      {SEVERITIES.map((sev) => {
        const group = findings.filter((f) => f.severity === sev);
        if (group.length === 0) return null;
        return (
          <div key={sev} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold capitalize tracking-tight text-default-600">
              <span className={`size-2 rounded-full ${SEVERITY_DOT[sev]}`} aria-hidden />
              {sev}
              <span className="font-normal normal-case tracking-[0.01em] text-default-400">
                · {group.length} · {SEVERITY_HINT[sev]}
              </span>
            </h2>
            {group.map((f) => (
              <FindingCard key={f.id} finding={f} website={website} />
            ))}
          </div>
        );
      })}
    </>
  );
}

export default function FixQueuePage() {
  const findings = useVisibilityFindings();
  const website = useBrandProfile().data?.profile.website?.trim() || null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <PageHeader
        title="Fix queue"
        description="Every open finding, ranked by impact. For quick approvals use Inbox; this is the full list."
      />
      <Section
        query={findings}
        skeleton={<TableSkeleton rows={6} />}
        errorLabel="Couldn't load your fix queue."
      >
        {(data) => <FindingsList findings={data.findings} website={website} />}
      </Section>
    </div>
  );
}
