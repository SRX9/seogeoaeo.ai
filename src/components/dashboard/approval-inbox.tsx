import { buttonVariants } from "@heroui/react/button";
import { Card } from "@heroui/react/card";
import Link from "next/link";
import type {
  Article,
  AutomationStats,
  IntegrationView,
  VisibilityFinding,
  VisibilityTraffic,
} from "@/lib/api/queries";

/**
 * AP3 §3.3 — "What does she need from me?": the ONE place the product ever asks
 * the user to do anything. Merges article drafts awaiting review, fixes awaiting
 * approval, and the unlock cards (connect GSC / CMS) into a single queue. Every
 * row: what, why it matters in owner language, one primary button. Empty state
 * on Autopilot: "Nothing — I've got it."
 */

type InboxRow = {
  key: string;
  what: string;
  why: string;
  href: string;
  cta: string;
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
}: {
  articles: Article[];
  findings: VisibilityFinding[];
  traffic: VisibilityTraffic;
  integrations: IntegrationView[];
  automation: AutomationStats;
}): InboxRow[] {
  const rows: InboxRow[] = [];

  // Drafts waiting on the owner. On Autopilot she publishes herself, so a
  // lingering draft is rare (a gate flagged it) — still worth surfacing.
  const drafts = articles.filter((article) => article.status === "draft");
  for (const draft of drafts.slice(0, MAX_DRAFT_ROWS)) {
    rows.push({
      key: `draft-${draft.id}`,
      what: `Review "${draft.title}"`,
      why: automation.autoPublish
        ? "I held this one back for your eyes before it goes live."
        : "Ready to publish — approve it and I'll push it live.",
      href: `/articles/${draft.id}`,
      cta: "Review draft",
    });
  }
  if (drafts.length > MAX_DRAFT_ROWS) {
    rows.push({
      key: "drafts-more",
      what: `${drafts.length - MAX_DRAFT_ROWS} more draft${drafts.length - MAX_DRAFT_ROWS === 1 ? "" : "s"} waiting`,
      why: "The rest of the queue, ready when you are.",
      href: "/articles",
      cta: "Open articles",
    });
  }

  // Fixes she can apply the moment you say yes — one row for the whole queue,
  // led by the most severe finding so the row says why it matters.
  const approvable = findings
    .filter((finding) => finding.fixCapability === "auto" || finding.fixCapability === "artifact")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  if (approvable.length > 0) {
    const lead = approvable[0];
    rows.push({
      key: "fixes",
      what:
        approvable.length === 1
          ? `Approve a fix: ${lead.title}`
          : `Approve ${approvable.length} prepared fixes`,
      why:
        approvable.length === 1
          ? "It's prepared — one click and it's applied, logged, and reversible."
          : `Starting with "${lead.title}" — each one applied, logged, and reversible.`,
      href: "/visibility/fixes",
      cta: "Open fix queue",
    });
  }

  // Unlock cards — the two things she genuinely can't do herself.
  if (!traffic.connected.gsc) {
    rows.push({
      key: "unlock-gsc",
      what: "Connect Search Console",
      why: "I'll prove my work with your real clicks and find the queries you already almost rank for.",
      href: "/settings?tab=integrations",
      cta: "Connect",
    });
  }
  if (integrations.length > 0 && !integrations.some((integration) => integration.enabled)) {
    rows.push({
      key: "unlock-cms",
      what: "Connect your site or CMS",
      why: "Then I publish articles and apply fixes on your real site — no copy-pasting.",
      href: "/settings?tab=integrations",
      cta: "Connect",
    });
  }

  return rows;
}

export function ApprovalInbox({
  articles,
  findings,
  traffic,
  integrations,
  automation,
}: {
  articles: Article[];
  findings: VisibilityFinding[];
  traffic: VisibilityTraffic;
  integrations: IntegrationView[];
  automation: AutomationStats;
}) {
  const rows = buildInboxRows({ articles, findings, traffic, integrations, automation });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Needs you</h2>
        <p className="mt-1 text-sm text-muted">
          The only things Claudia can&apos;t do without you.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-foreground">
            Nothing — I&apos;ve got it. Check back after my next run.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border p-0">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{row.what}</p>
                <p className="mt-0.5 text-sm text-muted">{row.why}</p>
              </div>
              <Link
                href={row.href}
                className={buttonVariants({ size: "sm", variant: "secondary" })}
              >
                {row.cta}
              </Link>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
