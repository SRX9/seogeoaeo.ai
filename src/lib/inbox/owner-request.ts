import type { AgentState } from "@/lib/agent/types";
import type { AutonomyMode } from "@/lib/workspace/settings";

export type OwnerRequestType =
  | "content_review"
  | "connection"
  | "permission"
  | "preference"
  | "billing"
  | "brand_correction";

export type OwnerRequestAction =
  | {
      kind: "approve_change" | "decline_change";
      label: string;
      approvalId: string;
    }
  | {
      kind: "publish_article";
      label: string;
      articleId: string;
    }
  | {
      kind: "link";
      label: string;
      href: string;
    };

export type OwnerRequestView = {
  id: string;
  type: OwnerRequestType;
  title: string;
  recommendation: string;
  reason: string;
  changeSummary: string;
  noActionOutcome: string;
  primaryAction: OwnerRequestAction;
  alternativeAction: OwnerRequestAction;
  readableDetails: Array<{ label: string; value: string }>;
};

export type OwnerApprovalInput = {
  id: string;
  actionType: string;
  beforeState: unknown;
  afterState: unknown;
  riskLevel: string;
  expectedBenefit: string;
};

export type OwnerArticleInput = {
  id: string;
  title: string;
  status: string;
  metaDescription?: string | null;
};

export type OwnerRequestInput = {
  agent: AgentState;
  approvals: OwnerApprovalInput[];
  articles: OwnerArticleInput[];
  autonomyMode: AutonomyMode;
  publishingConnected: boolean;
};

const RISK_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function humanize(value: string) {
  return value
    .replaceAll(/[._-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sentence(value: string) {
  return value ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function readableValue(value: unknown, empty: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string | number | boolean =>
        ["string", "number", "boolean"].includes(typeof item),
      )
      .slice(0, 3);
    return items.length > 0 ? items.join(", ") : empty;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(
        ([key, item]) =>
          !/(^id$|id$|ref|hash|record|task|trace|policy|version)/i.test(key) &&
          ["string", "number", "boolean"].includes(typeof item),
      )
      .sort(([left], [right]) => {
        const preferred = ["instruction", "title", "name", "status", "mode", "capability"];
        const rank = (key: string) => {
          const index = preferred.indexOf(key);
          return index === -1 ? preferred.length : index;
        };
        return rank(left) - rank(right);
      })
      .slice(0, 3)
      .map(([key, item]) => `${sentence(humanize(key))}: ${String(item)}`);
    return entries.length > 0 ? entries.join(" · ") : empty;
  }
  return empty;
}

function approvalTitle(actionType: string) {
  const action = humanize(actionType);
  if (action.startsWith("grant ")) {
    const permission = action.slice(6);
    if (/article.*update|update.*article/.test(permission)) {
      return "Allow Claudia to update articles";
    }
    if (/publish/.test(permission)) return "Allow Claudia to publish content";
    if (/site.*update|update.*site/.test(permission)) {
      return "Allow Claudia to update the website";
    }
    return "Review a new permission for Claudia";
  }
  if (action.startsWith("publish ")) return sentence(action);
  if (action.startsWith("update ")) {
    return `Review ${action.slice(7)} update`;
  }
  return `Review ${action}`;
}

function approvalReason(riskLevel: string) {
  if (riskLevel === "critical" || riskLevel === "high") {
    return "This could make a live or difficult-to-reverse change, so Claudia needs your permission.";
  }
  if (riskLevel === "medium") {
    return "This changes what Claudia may do for your brand and needs your permission.";
  }
  return "Your review preference requires permission before this change can go live.";
}

function approvalType(actionType: string): OwnerRequestType {
  if (/^grant\b/i.test(actionType)) return "permission";
  return /publish|article|content/i.test(actionType) ? "content_review" : "permission";
}

function approvalRequest(approval: OwnerApprovalInput): OwnerRequestView {
  const title = approvalTitle(approval.actionType);
  const current = readableValue(approval.beforeState, "No existing setting");
  const proposed = readableValue(approval.afterState, "The proposed change");
  return {
    id: `approval-${approval.id}`,
    type: approvalType(approval.actionType),
    title,
    recommendation:
      approval.expectedBenefit.trim() ||
      `Claudia recommends approving this ${humanize(approval.actionType)}.`,
    reason: approvalReason(approval.riskLevel),
    changeSummary: `Current: ${current}. Proposed: ${proposed}.`,
    noActionOutcome:
      "Claudia will keep the current setup and continue any unrelated safe work.",
    primaryAction: {
      kind: "approve_change",
      label: "Approve change",
      approvalId: approval.id,
    },
    alternativeAction: {
      kind: "decline_change",
      label: "Keep current",
      approvalId: approval.id,
    },
    readableDetails: [
      { label: "Current", value: current },
      { label: "Proposed", value: proposed },
    ],
  };
}

function connectionRequest(firstDraft: OwnerArticleInput): OwnerRequestView {
  return {
    id: "publishing-destination",
    type: "connection",
    title: "Choose where Claudia should publish",
    recommendation:
      "Connect your website or CMS so Claudia can publish the ready article for you.",
    reason: `“${firstDraft.title}” is ready, but Claudia does not have a publishing destination yet.`,
    changeSummary:
      "Claudia will be able to send approved content to the destination you choose.",
    noActionOutcome:
      "Your content will stay safely saved as a draft until you connect a destination.",
    primaryAction: {
      kind: "link",
      label: "Choose destination",
      href: "/settings?tab=integrations",
    },
    alternativeAction: {
      kind: "link",
      label: "Review content first",
      href: `/articles/${firstDraft.id}`,
    },
    readableDetails: [{ label: "Ready to publish", value: firstDraft.title }],
  };
}

function articleRequest(
  article: OwnerArticleInput,
  publishingConnected: boolean,
  autonomyMode: AutonomyMode,
): OwnerRequestView {
  return {
    id: `article-${article.id}`,
    type: "content_review",
    title: `Review “${article.title}”`,
    recommendation: "Claudia recommends reviewing this article and publishing it when it is ready.",
    reason:
      autonomyMode === "REVIEW"
        ? "This appeared because your operating mode requires review before publishing."
        : "Claudia's checks found something that needs your judgment before this can go live.",
    changeSummary: publishingConnected
      ? "The article will be published to your connected destination after final checks."
      : "The article will remain a draft until you choose a publishing destination.",
    noActionOutcome:
      "The article will stay saved as a draft while Claudia continues other useful work.",
    primaryAction: publishingConnected
      ? {
          kind: "publish_article",
          label: "Publish now",
          articleId: article.id,
        }
      : {
          kind: "link",
          label: "Review article",
          href: `/articles/${article.id}`,
        },
    alternativeAction: publishingConnected
      ? {
          kind: "link",
          label: "Edit first",
          href: `/articles/${article.id}`,
        }
      : {
          kind: "link",
          label: "Choose destination",
          href: "/settings?tab=integrations",
        },
    readableDetails: [
      { label: "Article", value: article.title },
      ...(article.metaDescription?.trim()
        ? [{ label: "Summary", value: article.metaDescription.trim() }]
        : []),
    ],
  };
}

function billingRequest(reason: string): OwnerRequestView {
  const needsCredits = /credit|capacity/i.test(reason);
  return {
    id: "billing-paused",
    type: "billing",
    title: needsCredits ? "Add work capacity" : "Restore Claudia's plan",
    recommendation: needsCredits
      ? "Add credits so Claudia can continue from the saved work."
      : "Restore an active plan so Claudia can continue from the saved work.",
    reason: "Claudia is paused, and all completed and in-progress work is safe.",
    changeSummary: "Claudia will resume automatically after billing is ready.",
    noActionOutcome: "Claudia will stay paused and keep your saved work unchanged.",
    primaryAction: {
      kind: "link",
      label: needsCredits ? "Add credits" : "Review plan",
      href: "/settings?tab=billing",
    },
    alternativeAction: {
      kind: "link",
      label: "Keep Claudia paused",
      href: "/dashboard",
    },
    readableDetails: [],
  };
}

function waitingRequest(waiting: NonNullable<AgentState["waiting"]>): OwnerRequestView | null {
  if (waiting.kind === "recovery" || waiting.kind === "approval") return null;
  if (/search console|prepared fixes?|install .*fix|review [“"]/.test(waiting.title.toLowerCase())) {
    return null;
  }
  const isBrandCorrection = /brand|voice|audience|customer|competitor|conflict/i.test(
    waiting.title,
  );
  const type: OwnerRequestType =
    waiting.kind === "connection"
      ? "connection"
      : isBrandCorrection
        ? "brand_correction"
        : "preference";
  return {
    id: `waiting-${waiting.id}`,
    type,
    title: waiting.title,
    recommendation: waiting.blockedValue,
    reason:
      waiting.kind === "connection"
        ? "Claudia needs this connection to continue the affected work."
        : "Only the work affected by this choice is paused.",
    changeSummary:
      waiting.kind === "connection"
        ? "The affected work will continue automatically when the connection is ready."
        : "Claudia will use your choice for the affected work and continue automatically.",
    noActionOutcome: "Claudia will leave the affected work paused and continue other safe work.",
    primaryAction: {
      kind: "link",
      label: waiting.actionLabel,
      href: waiting.href,
    },
    alternativeAction: {
      kind: "link",
      label: "Decide later",
      href: "/dashboard",
    },
    readableDetails: [],
  };
}

export function buildOwnerRequests(input: OwnerRequestInput): OwnerRequestView[] {
  const drafts = input.articles.filter((article) => article.status === "draft");
  const requests: OwnerRequestView[] = [];

  if (input.agent.presence.id === "paused" && /credit|capacity|plan|subscription/i.test(input.agent.presence.reason)) {
    requests.push(billingRequest(input.agent.presence.reason));
  }

  requests.push(
    ...input.approvals
      .toSorted(
        (left, right) =>
          (RISK_RANK[left.riskLevel] ?? 9) - (RISK_RANK[right.riskLevel] ?? 9),
      )
      .map(approvalRequest),
  );

  if (drafts[0] && !input.publishingConnected) {
    requests.push(connectionRequest(drafts[0]));
  }

  const waiting = input.agent.waiting ? waitingRequest(input.agent.waiting) : null;
  if (waiting && !requests.some((request) => request.type === waiting.type)) {
    requests.push(waiting);
  }

  if (input.autonomyMode !== "AUTO_PUBLISH_FAST") {
    requests.push(
      ...drafts.map((article) =>
        articleRequest(article, input.publishingConnected, input.autonomyMode),
      ),
    );
  }

  return requests;
}

export function countOwnerRequestsFromParts(parts: {
  approvalCount: number;
  draftCount: number;
  autonomyMode: AutonomyMode;
  publishingConnected: boolean;
  billingPaused: boolean;
}) {
  return (
    parts.approvalCount +
    (parts.billingPaused ? 1 : 0) +
    (parts.draftCount > 0 && !parts.publishingConnected ? 1 : 0) +
    (parts.autonomyMode !== "AUTO_PUBLISH_FAST" ? parts.draftCount : 0)
  );
}
