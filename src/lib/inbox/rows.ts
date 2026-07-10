import type {
  Article,
  AutomationStats,
  IntegrationView,
  VisibilityFinding,
  VisibilityTraffic,
} from "@/lib/api/queries";
import { isInstallReady } from "@/lib/visibility/fix-policy";

/**
 * Pure inbox row builder — shared by ApprovalInbox, shell badge counts, and Ask.
 * No React; safe to import from client or server.
 */

export type InboxRow =
  | {
      key: string;
      kind: "draft";
      what: string;
      why: string;
      href: string;
      cta: string;
      article: Article;
    }
  | {
      key: string;
      kind: "fixes";
      what: string;
      why: string;
      href: string;
      cta: string;
      findings: VisibilityFinding[];
    }
  | {
      key: string;
      kind: "unlock-gsc";
      what: string;
      why: string;
      href: string;
      cta: string;
    }
  | {
      key: string;
      kind: "unlock-cms";
      what: string;
      why: string;
      href: string;
      cta: string;
    };

export type InboxInputs = {
  articles: Article[];
  findings: VisibilityFinding[];
  traffic: VisibilityTraffic;
  integrations: IntegrationView[];
  automation: AutomationStats;
};

const MAX_DRAFT_ROWS = 3;

const SEVERITY_ORDER: Record<VisibilityFinding["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function buildInboxRows({
  articles,
  findings,
  traffic,
  integrations,
  automation,
}: InboxInputs): InboxRow[] {
  const rows: InboxRow[] = [];

  const drafts = articles.filter((article) => article.status === "draft");
  for (const draft of drafts.slice(0, MAX_DRAFT_ROWS)) {
    rows.push({
      key: `draft-${draft.id}`,
      kind: "draft",
      what: `Review "${draft.title}"`,
      why: automation.autoPublish
        ? "I held this one back for your eyes before it goes live."
        : "Ready to publish — approve it and I'll push it live.",
      href: `/articles/${draft.id}`,
      cta: "Review",
      article: draft,
    });
  }
  if (drafts.length > MAX_DRAFT_ROWS) {
    rows.push({
      key: "drafts-more",
      kind: "draft",
      what: `${drafts.length - MAX_DRAFT_ROWS} more draft${drafts.length - MAX_DRAFT_ROWS === 1 ? "" : "s"} waiting`,
      why: "The rest of the queue, ready when you are.",
      href: "/articles",
      cta: "Open articles",
      article: drafts[MAX_DRAFT_ROWS]!,
    });
  }

  const installReady = findings
    .filter((finding) => isInstallReady(finding.fixCapability))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  if (installReady.length > 0) {
    const lead = installReady[0]!;
    rows.push({
      key: "fixes",
      kind: "fixes",
      what:
        installReady.length === 1
          ? `Install a fix: ${lead.title}`
          : `Install ${installReady.length} prepared fixes`,
      why:
        installReady.length === 1
          ? "Ready to copy onto your site — mark done when it's live; Claudia re-checks next audit."
          : `Starting with "${lead.title}" — copy each fix, install on your site, then mark done.`,
      href: "/visibility/fixes",
      cta: "Review fixes",
      findings: installReady,
    });
  }

  if (!traffic.connected.gsc) {
    rows.push({
      key: "unlock-gsc",
      kind: "unlock-gsc",
      what: "Connect Search Console",
      why: "I'll prove my work with your real clicks and find the queries you already almost rank for.",
      href: "/settings?tab=integrations",
      cta: "Connect",
    });
  }
  if (integrations.length > 0 && !integrations.some((integration) => integration.enabled)) {
    rows.push({
      key: "unlock-cms",
      kind: "unlock-cms",
      what: "Connect your site or CMS",
      why: "Then I can publish articles to your real site without a manual export.",
      href: "/settings?tab=integrations",
      cta: "Connect",
    });
  }

  return rows;
}

/** Same semantics as `buildInboxRows(...).length` without building article objects. */
export function countInboxFromParts(parts: {
  draftCount: number;
  approvableFixCount: number;
  gscConnected: boolean;
  hasIntegrations: boolean;
  anyIntegrationEnabled: boolean;
}): number {
  let count = 0;
  if (parts.draftCount > 0) {
    count += Math.min(parts.draftCount, MAX_DRAFT_ROWS);
    if (parts.draftCount > MAX_DRAFT_ROWS) count += 1;
  }
  if (parts.approvableFixCount > 0) count += 1;
  if (!parts.gscConnected) count += 1;
  if (parts.hasIntegrations && !parts.anyIntegrationEnabled) count += 1;
  return count;
}
