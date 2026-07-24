import type { AgentState } from "@/lib/agent/types";
import type { AutomationStats, VisibilityFinding } from "@/lib/api/queries";
import type { OwnerRequestView } from "@/lib/inbox/owner-request";

export type ClaudiaHomeStatus =
  | "working"
  | "on_track"
  | "waiting_for_user"
  | "paused"
  | "technical_issue";

export type ClaudiaHomeAction = {
  href: string;
  label: string;
};

export type ClaudiaOwnerRequest = {
  title: string;
  recommendation: string;
  reason: string;
  action: ClaudiaHomeAction;
};

export type ClaudiaContentOpportunity = {
  id: string;
  title: string;
  whyItMatters: string;
  audience: string;
  format: string;
};

export type ClaudiaChecklistItem = {
  id: string;
  pillar: "seo" | "aeo" | "geo";
  title: string;
  whyItMatters: string;
  href: string;
};

export type ClaudiaHomeView = {
  status: ClaudiaHomeStatus;
  headline: string;
  explanation: string;
  nextUpdateAt: string | null;
  needsInputCount: number;
  primaryAction: ClaudiaHomeAction | null;
  ownerRequest: ClaudiaOwnerRequest | null;
  contentOpportunity: ClaudiaContentOpportunity | null;
  checklistItem: ClaudiaChecklistItem | null;
};

type ClaudiaHomeInput = {
  agent: AgentState;
  ownerRequests: OwnerRequestView[];
  automation: AutomationStats;
  findings: VisibilityFinding[];
};

function buildOwnerRequest(input: ClaudiaHomeInput): ClaudiaOwnerRequest | null {
  const request = input.ownerRequests[0];
  if (!request) return null;

  return {
    title: request.title,
    recommendation: request.recommendation,
    reason: request.reason,
    action:
      request.primaryAction.kind === "link"
        ? {
            href: request.primaryAction.href,
            label: request.primaryAction.label,
          }
        : { href: "/dashboard#needs-input", label: "Review decision" },
  };
}

function pausedAction(agent: AgentState): ClaudiaHomeAction {
  const reason = agent.presence.reason.toLowerCase();
  if (reason.includes("credit")) {
    return { href: "/account?tab=billing", label: "Add capacity" };
  }
  if (reason.includes("plan") || reason.includes("subscription")) {
    return { href: "/account?tab=billing", label: "Review plan" };
  }
  return { href: "/settings", label: "Review settings" };
}

function workingCopy(agent: AgentState) {
  const kind = `${agent.now?.taskType ?? ""} ${agent.now?.title ?? ""}`.toLowerCase();
  if (/write|article|draft|content/.test(kind)) {
    return {
      headline: "Claudia is creating your next useful answer",
      explanation: "She is turning a researched opportunity into useful content for your customers.",
    };
  }
  if (/audit|visibility|measure|monitor|performance/.test(kind)) {
    return {
      headline: "Claudia is checking what your website should fix next",
      explanation: "She is assessing search and AI discovery and prioritizing the next useful improvement.",
    };
  }
  return {
    headline: "Claudia is finding your next useful move",
    explanation: "She is choosing the most useful safe work for your brand.",
  };
}

function audienceFor(intentTier: string | null) {
  if (intentTier === "high") return "People close to choosing a solution";
  if (intentTier === "medium") return "People comparing approaches";
  return "People researching this problem";
}

function formatFor(answerFit: string | null) {
  const value = answerFit?.toLowerCase() ?? "";
  if (value.includes("faq")) return "FAQ or answer page";
  if (value.includes("comparison")) return "Comparison guide";
  if (value.includes("how") || value.includes("tutorial")) return "How-to guide";
  return "In-depth article";
}

function buildContentOpportunity(
  automation: AutomationStats,
): ClaudiaContentOpportunity | null {
  const topic = automation.nextTopic;
  if (!topic) return null;

  return {
    id: topic.id,
    title: topic.title,
    whyItMatters:
      topic.rationale ??
      topic.thesis ??
      topic.angle ??
      "Claudia found a relevant question your brand can answer more completely.",
    audience: audienceFor(topic.intentTier),
    format: formatFor(topic.answerFit),
  };
}

function buildChecklistItem(findings: VisibilityFinding[]): ClaudiaChecklistItem | null {
  const finding = findings[0];
  if (!finding) return null;

  return {
    id: finding.id,
    pillar: finding.pillar,
    title: finding.title,
    whyItMatters: finding.recommendation,
    href: `/checklist?item=${finding.id}`,
  };
}

export function buildClaudiaHomeView(input: ClaudiaHomeInput): ClaudiaHomeView {
  const technicalIssue =
    input.agent.presence.id === "needs_attention" ||
    input.agent.waiting?.kind === "recovery";
  const ownerRequest = buildOwnerRequest(input);
  const contentOpportunity = buildContentOpportunity(input.automation);
  const checklistItem = buildChecklistItem(input.findings);
  const needsInputCount = input.ownerRequests.length;

  let status: ClaudiaHomeStatus;
  let headline: string;
  let explanation: string;
  let primaryAction: ClaudiaHomeAction | null = null;

  if (technicalIssue) {
    status = "technical_issue";
    headline = "Claudia hit a technical problem";
    explanation =
      "Your saved work is safe. Claudia is retrying what she can, and the system has the details needed to investigate.";
  } else if (input.agent.presence.id === "paused") {
    status = "paused";
    headline = "Claudia is paused";
    explanation = "Your saved work is safe. Claudia will continue when she has what she needs.";
    primaryAction = pausedAction(input.agent);
  } else if (ownerRequest) {
    status = "waiting_for_user";
    headline = "Claudia needs one decision";
    explanation = ownerRequest.reason;
    primaryAction = ownerRequest.action;
  } else if (contentOpportunity) {
    status = input.agent.presence.isWorking ? "working" : "on_track";
    headline = "Your customers are searching for an answer you have not published yet.";
    explanation = contentOpportunity.whyItMatters;
  } else if (checklistItem) {
    status = input.agent.presence.isWorking ? "working" : "on_track";
    headline = "Your website has one important issue to fix next.";
    explanation = checklistItem.whyItMatters;
    primaryAction = { href: checklistItem.href, label: "See the exact fix" };
  } else if (input.agent.presence.isWorking) {
    status = "working";
    ({ headline, explanation } = workingCopy(input.agent));
  } else {
    status = "on_track";
    headline = "Claudia is looking for your next useful opportunity.";
    explanation =
      "She is studying your customers, competitors, search opportunities, and website to decide what matters next.";
    primaryAction = { href: "/articles?view=ideas", label: "Open Content" };
  }

  return {
    status,
    headline,
    explanation,
    nextUpdateAt:
      status === "paused" ||
      status === "technical_issue" ||
      status === "waiting_for_user"
        ? null
        : (input.agent.next[0]?.scheduledFor ?? input.automation.nextRunAt),
    needsInputCount: Math.max(needsInputCount, ownerRequest ? 1 : 0),
    primaryAction,
    ownerRequest,
    contentOpportunity,
    checklistItem,
  };
}
