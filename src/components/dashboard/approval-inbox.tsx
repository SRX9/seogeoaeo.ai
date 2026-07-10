"use client";

import { Button, toast } from "@heroui/react";
import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LoadingButton } from "@/components/ui/loading-button";
import { apiGet, apiPatch, apiPost, getErrorMessage } from "@/lib/api/fetcher";
import {
  queryKeys,
  useGoogleTraffic,
  type Article,
  type AutomationStats,
  type IntegrationView,
  type VisibilityFinding,
  type VisibilityTraffic,
} from "@/lib/api/queries";
import { parseTags } from "@/lib/articles/format";
import {
  notifyPublishError,
  notifyPublishResult,
} from "@/lib/articles/notify-publish";
import { authClient } from "@/lib/auth/client";
import { buildInboxRows } from "@/lib/inbox/rows";
import { GOOGLE_TRAFFIC_SCOPES } from "@/lib/integrations/google-scopes";
import { buildFixArtifact } from "@/lib/visibility/fix-artifact";
import { isInstallReady } from "@/lib/visibility/fix-policy";
import { cn } from "@/lib/cn";

export { buildInboxRows } from "@/lib/inbox/rows";

/**
 * AP3 + Phase 2 — "What does she need from me?": ONE queue that ever asks
 * anything, with inline actions so the owner rarely leaves Claudia / Inbox.
 */

function invalidateInbox(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.articles });
  void queryClient.invalidateQueries({ queryKey: queryKeys.visibilityFindings });
  void queryClient.invalidateQueries({ queryKey: queryKeys.visibilityTraffic });
  void queryClient.invalidateQueries({ queryKey: queryKeys.googleTraffic });
  void queryClient.invalidateQueries({ queryKey: queryKeys.integrations });
  void queryClient.invalidateQueries({ queryKey: queryKeys.automation });
  void queryClient.invalidateQueries({ queryKey: queryKeys.activity });
  void queryClient.invalidateQueries({ queryKey: queryKeys.inboxSummary });
  void queryClient.invalidateQueries({ queryKey: queryKeys.agentState });
}

function articleHasBody(article: Article): boolean {
  if (typeof article.bodyLength === "number") return article.bodyLength >= 20;
  return (article.bodyMarkdown?.trim().length ?? 0) >= 20;
}

function DraftActions({
  article,
  isOverflow,
}: {
  article: Article;
  isOverflow: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const hasBody = articleHasBody(article);

  async function approveAndPublish() {
    setBusy(true);
    try {
      // List omits body — load detail for PATCH contract (needs full markdown).
      const detail = await apiGet<{ article: Article }>(`/api/articles/${article.id}`);
      const a = detail.article;
      await apiPatch(`/api/articles/${article.id}`, {
        title: a.title,
        slug: a.slug,
        metaDescription: a.metaDescription ?? "",
        // DB stores tags as JSON; API expects comma-separated or an array.
        tags: parseTags(a.tags).join(", "),
        bodyMarkdown: a.bodyMarkdown,
        status: "approved",
      });
      try {
        const summary = await apiPost<{
          published: number;
          skipped: number;
          failed: number;
          unchanged?: boolean;
        }>(`/api/articles/${article.id}/publish`);
        notifyPublishResult(summary);
      } catch (error) {
        notifyPublishError(error);
      }
      invalidateInbox(queryClient);
    } catch (error) {
      toast.danger(getErrorMessage(error, "Couldn't approve this draft."));
    } finally {
      setBusy(false);
    }
  }

  if (isOverflow) {
    return (
      <Link href="/articles" className={buttonVariants({ size: "sm", variant: "secondary" })}>
        Open articles
      </Link>
    );
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <p className="line-clamp-3 text-sm text-muted">
        {article.metaDescription?.trim() || "Open the draft for the full preview."}
      </p>
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          size="sm"
          isPending={busy}
          pendingLabel="Publishing…"
          isDisabled={!hasBody}
          onPress={approveAndPublish}
        >
          Approve &amp; publish
        </LoadingButton>
        <Link
          href={`/articles/${article.id}`}
          className={buttonVariants({ size: "sm", variant: "secondary" })}
        >
          Edit first
        </Link>
      </div>
    </div>
  );
}

function FixActions({ findings }: { findings: VisibilityFinding[] }) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(findings[0]?.id ?? null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function markInstalled(findingId: string) {
    setApplyingId(findingId);
    try {
      await apiPost("/api/visibility/fix", { findingId });
      toast.success("Marked installed — Claudia re-checks on the next audit.");
      invalidateInbox(queryClient);
    } catch (error) {
      toast.danger(getErrorMessage(error, "Couldn't update this finding."));
    } finally {
      setApplyingId(null);
    }
  }

  async function copyArtifact(finding: VisibilityFinding) {
    const artifact = buildFixArtifact(finding.fixPayload);
    const text = artifact.content.trim();
    if (!text) {
      toast.info("No paste-ready artifact — open the full fix queue for steps.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(finding.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Fix copied — install on your site, then mark done.");
    } catch {
      toast.danger("Couldn't copy — browser blocked clipboard access.");
    }
  }

  const applying = applyingId != null;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {findings.slice(0, 5).map((finding) => {
        const open = expandedId === finding.id;
        const artifact = buildFixArtifact(finding.fixPayload);
        const hasArtifact = artifact.content.trim().length > 0;
        const ready = isInstallReady(finding.fixCapability);
        return (
          <div
            key={finding.id}
            className="rounded-xl border border-border/50 bg-surface-secondary/30 px-3 py-2.5"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <button
                type="button"
                className="pressable min-w-0 flex-1 rounded-lg text-left"
                onClick={() => setExpandedId(open ? null : finding.id)}
              >
                <p className="text-sm font-medium tracking-tight text-foreground">
                  {finding.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
                  {finding.recommendation}
                </p>
              </button>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {hasArtifact ? (
                  <Button
                    size="sm"
                    variant="primary"
                    isDisabled={applying}
                    onPress={() => copyArtifact(finding)}
                  >
                    {copiedId === finding.id ? "Copied ✓" : "Copy fix"}
                  </Button>
                ) : null}
                {ready ? (
                  <LoadingButton
                    size="sm"
                    variant="secondary"
                    isPending={applyingId === finding.id}
                    pendingLabel="Saving…"
                    isDisabled={applying && applyingId !== finding.id}
                    onPress={() => markInstalled(finding.id)}
                  >
                    I installed this
                  </LoadingButton>
                ) : null}
              </div>
            </div>
            {open && hasArtifact ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-default-100 p-2 text-[11px] leading-relaxed">
                {artifact.content}
              </pre>
            ) : null}
          </div>
        );
      })}
      {findings.length > 5 ? (
        <Link
          href="/visibility/fixes"
          className="inline-block text-sm text-muted transition-colors hover-fine:text-foreground"
        >
          View all {findings.length} in Workshop
        </Link>
      ) : null}
    </div>
  );
}

function GscConnectActions() {
  const queryClient = useQueryClient();
  const traffic = useGoogleTraffic();
  const [connecting, setConnecting] = useState(false);
  const needsConnect = traffic.data?.needsConnect ?? true;

  async function connect() {
    setConnecting(true);
    try {
      const callbackURL =
        typeof window !== "undefined" ? window.location.href : "/inbox";
      const { data, error } = await authClient.linkSocial({
        provider: "google",
        scopes: [...GOOGLE_TRAFFIC_SCOPES],
        callbackURL,
      });
      if (error) throw new Error(error.message ?? "Link failed");
      if (data && "url" in data && typeof data.url === "string") {
        window.location.href = data.url;
        return;
      }
      invalidateInbox(queryClient);
      toast.success("Google connected — pick your site under Brand → Connections if needed.");
      setConnecting(false);
    } catch (error) {
      toast.danger(getErrorMessage(error, "Couldn't start the Google connection"));
      setConnecting(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-sm text-muted">
        Read-only access to Search Console (and optional GA4). I use it for proof and smarter
        topics — never to change your site.
      </p>
      {needsConnect ? (
        <LoadingButton
          size="sm"
          isPending={connecting}
          pendingLabel="Opening Google…"
          onPress={connect}
        >
          Connect Search Console
        </LoadingButton>
      ) : (
        <Link
          href="/settings?tab=integrations"
          className={buttonVariants({ size: "sm", variant: "secondary" })}
        >
          Choose your GSC site
        </Link>
      )}
    </div>
  );
}

function CmsConnectActions({ integrations }: { integrations: IntegrationView[] }) {
  const available = integrations.filter((i) => i.status === "available" || i.configurable);
  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <p className="text-sm text-muted">
        Pick where I should publish and apply on-site fixes. Setup takes a minute per platform.
      </p>
      <ul className="space-y-2">
        {available.slice(0, 4).map((integration) => (
          <li
            key={integration.provider}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{integration.name}</p>
              <p className="truncate text-xs text-muted">{integration.requirements.summary}</p>
            </div>
            <Link
              href="/settings?tab=integrations"
              className={buttonVariants({ size: "sm", variant: "secondary" })}
            >
              Set up
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/help/integrations"
        className="text-sm text-muted transition-colors hover-fine:text-foreground"
      >
        Integration guide
      </Link>
    </div>
  );
}

export function ApprovalInbox({
  articles,
  findings,
  traffic,
  integrations,
  automation,
  showHeader = true,
  maxRows,
}: {
  articles: Article[];
  findings: VisibilityFinding[];
  traffic: VisibilityTraffic;
  integrations: IntegrationView[];
  automation: AutomationStats;
  showHeader?: boolean;
  maxRows?: number;
}) {
  const rows = useMemo(
    () => buildInboxRows({ articles, findings, traffic, integrations, automation }),
    [articles, findings, traffic, integrations, automation],
  );
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (openKey != null && !rows.some((r) => r.key === openKey)) {
      setOpenKey(null);
    }
  }, [openKey, rows]);

  const visible =
    typeof maxRows === "number" && rows.length > maxRows ? rows.slice(0, maxRows) : rows;
  const overflow =
    typeof maxRows === "number" && rows.length > maxRows ? rows.length - maxRows : 0;

  return (
    <section className="space-y-3.5">
      {showHeader ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="type-title text-lg text-foreground">Needs you</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The only things Claudia can&apos;t do without you.
            </p>
          </div>
          {rows.length > 0 ? (
            <Link
              href="/inbox"
              className="pressable shrink-0 rounded-md text-sm text-muted hover-fine:text-foreground"
            >
              Open inbox
              {rows.length > 1 ? ` (${rows.length})` : ""}
            </Link>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">Nothing needed from you.</p>
      ) : (
        <Card className="material-panel divide-y divide-border/50 p-0">
          {visible.map((row) => {
            const isOpen = openKey === row.key;
            const isOverflowDraft = row.key === "drafts-more";
            return (
              <div key={row.key} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium tracking-tight text-foreground">{row.what}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted">{row.why}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isOpen ? "secondary" : "primary"}
                      onPress={() => setOpenKey(isOpen ? null : row.key)}
                    >
                      {isOpen ? "Hide" : row.cta}
                    </Button>
                    {!isOpen && row.kind !== "unlock-gsc" ? (
                      <Link
                        href={row.href}
                        className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}
                      >
                        Open page
                      </Link>
                    ) : null}
                  </div>
                </div>
                {isOpen ? (
                  row.kind === "draft" ? (
                    <DraftActions article={row.article} isOverflow={isOverflowDraft} />
                  ) : row.kind === "fixes" ? (
                    <FixActions findings={row.findings} />
                  ) : row.kind === "unlock-gsc" ? (
                    <GscConnectActions />
                  ) : (
                    <CmsConnectActions integrations={integrations} />
                  )
                ) : null}
              </div>
            );
          })}
          {overflow > 0 ? (
            <div className="flex items-center justify-between gap-2 p-4">
              <p className="text-sm text-muted">
                {overflow} more item{overflow === 1 ? "" : "s"} waiting
              </p>
              <Link href="/inbox" className={buttonVariants({ size: "sm", variant: "ghost" })}>
                View all
              </Link>
            </div>
          ) : null}
        </Card>
      )}
    </section>
  );
}
