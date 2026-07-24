import type { AgentState } from "@/lib/agent/types";
import type {
  Article,
  AutomationStats,
  VisibilityAnswers,
  VisibilitySummary,
  VisibilityTraffic,
} from "@/lib/api/queries";
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

export type ClaudiaResultHighlight = {
  id: "google" | "ai" | "health";
  label: string;
  value: string;
  description: string;
  href: string;
  tone: "positive" | "attention" | "neutral";
};

export type ClaudiaRecentContent = {
  id: string;
  title: string;
  status: string;
  detail: string;
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
  weeklySummary: string;
  recentContent: ClaudiaRecentContent[];
  resultHighlights: ClaudiaResultHighlight[];
  activityHref: string;
};

type ClaudiaHomeInput = {
  agent: AgentState;
  ownerRequests: OwnerRequestView[];
  articles: Article[];
  automation: AutomationStats;
  answers: VisibilityAnswers;
  summary: VisibilitySummary;
  traffic: VisibilityTraffic;
};

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function buildWeeklySummary(automation: AutomationStats) {
  const { articlesWritten, articlesPublished } = automation.thisWeek;
  if (articlesWritten > 0 || articlesPublished > 0) {
    return `This week Claudia wrote ${plural(articlesWritten, "article")} and published ${plural(articlesPublished, "article")}. She will keep measuring what performs and improve what needs help.`;
  }
  if (automation.pendingTopics > 0) {
    return `Claudia has ${plural(automation.pendingTopics, "researched opportunity", "researched opportunities")} ready and is choosing the most useful work to do next.`;
  }
  return "Claudia is monitoring your brand and preparing the next useful opportunity. Completed work will appear here automatically.";
}

function recentContentDetail(article: Article) {
  if (article.performance?.verdict === "winner") {
    return "This article is gaining traction.";
  }
  if (article.performance?.verdict === "stalling") {
    return "Claudia is watching this article and will improve it if it stays flat.";
  }
  if (article.performance?.verdict === "dead") {
    return "Claudia will revisit this underperforming article.";
  }
  if (article.status === "published") return "Published and being monitored.";
  if (article.status === "draft") return "Ready for review before publishing.";
  if (article.status === "scheduled") return "Scheduled for publishing.";
  return "Claudia is preparing this content.";
}

function recentContentStatus(article: Article, autoPublish: boolean) {
  if (article.status === "published") return "Published";
  if (article.status === "scheduled") return "Scheduled";
  if (article.status === "draft") {
    return autoPublish ? "Quality checks in progress" : "Needs review";
  }
  return "In progress";
}

function buildRecentContent(articles: Article[], autoPublish: boolean) {
  return [...articles]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3)
    .map((article) => ({
      id: article.id,
      title: article.title,
      status: recentContentStatus(article, autoPublish),
      detail: recentContentDetail(article),
      href: `/articles/${article.id}`,
    }));
}

function googleHighlight(traffic: VisibilityTraffic): ClaudiaResultHighlight {
  if (!traffic.connected.gsc) {
    return {
      id: "google",
      label: "Found in Google",
      value: "Not connected",
      description: "Connect Search Console so Claudia can measure search discovery.",
      href: "/settings?tab=integrations",
      tone: "neutral",
    };
  }

  const rows = [...traffic.gsc].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const current = rows.slice(-28).reduce((total, row) => total + row.clicks, 0);
  const previous = rows.slice(-56, -28).reduce((total, row) => total + row.clicks, 0);
  const delta =
    previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

  return {
    id: "google",
    label: "Found in Google",
    value: `${current.toLocaleString()} clicks`,
    description:
      delta == null
        ? "Claudia is collecting a reliable comparison."
        : delta === 0
          ? "Search clicks are holding steady."
          : `Search clicks are ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}% from the previous period.`,
    href: "/visibility",
    tone: delta == null || delta === 0 ? "neutral" : delta > 0 ? "positive" : "attention",
  };
}

function aiHighlight(answers: VisibilityAnswers): ClaudiaResultHighlight {
  const checks = answers.share.reduce((total, row) => total + row.prompts, 0);
  const appearances = answers.share.reduce((total, row) => total + row.appeared, 0);
  const share = checks > 0 ? Math.round((appearances / checks) * 100) : null;

  return {
    id: "ai",
    label: "Found in AI answers",
    value: share == null ? "Collecting data" : `${share}%`,
    description:
      checks > 0
        ? `Your brand appeared in ${appearances} of ${checks} tracked checks.`
        : "Claudia is preparing the first tracked questions.",
    href: "/visibility/answers",
    tone: share != null && share > 0 ? "positive" : "neutral",
  };
}

function healthHighlight(summary: VisibilitySummary): ClaudiaResultHighlight {
  const score = summary.latest?.overall;
  const delta =
    score != null && summary.previousOverall != null
      ? Math.round(score - summary.previousOverall)
      : null;

  return {
    id: "health",
    label: "Online discovery health",
    value: score == null ? "Not measured yet" : `${Math.round(score)}/100`,
    description:
      score == null
        ? "Claudia will create a baseline as the first checks finish."
        : delta == null
          ? "This is your first reliable baseline."
          : delta === 0
            ? "Your discovery health is holding steady."
            : `Discovery health moved ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points.`,
    href: summary.latest ? `/visibility/${summary.latest.id}` : "/visibility",
    tone: delta == null || delta === 0 ? "neutral" : delta > 0 ? "positive" : "attention",
  };
}

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
        : { href: "/inbox", label: "Review decision" },
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
  return { href: "/settings?tab=preferences", label: "Resume Claudia" };
}

function workingCopy(agent: AgentState) {
  const kind = `${agent.now?.taskType ?? ""} ${agent.now?.title ?? ""}`.toLowerCase();
  if (/publish/.test(kind)) {
    return {
      headline: "Claudia is publishing approved content",
      explanation: "She is completing the destination checks and will confirm when the content is live.",
    };
  }
  if (/write|article|draft|content/.test(kind)) {
    return {
      headline: "Claudia is creating your next article",
      explanation: "She is turning a researched opportunity into useful content for your customers.",
    };
  }
  if (/audit|visibility|measure|monitor|performance/.test(kind)) {
    return {
      headline: "Claudia is checking how people discover your brand",
      explanation: "She is measuring search and AI discovery and deciding what should improve next.",
    };
  }
  if (/research|topic|keyword|competitor|trend/.test(kind)) {
    return {
      headline: "Claudia is researching your next content opportunities",
      explanation: "She is comparing customer questions, search demand, and competitor gaps to find the strongest ideas.",
    };
  }
  return {
    headline: "Claudia is working on your growth",
    explanation: "She is choosing and completing the most useful safe work for your brand.",
  };
}

export function buildClaudiaHomeView(input: ClaudiaHomeInput): ClaudiaHomeView {
  const technicalIssue =
    input.agent.presence.id === "needs_attention" ||
    input.agent.waiting?.kind === "recovery";
  const ownerRequest = buildOwnerRequest(input);
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
    explanation = input.agent.presence.reason.toLowerCase().includes("credit")
      ? "Claudia has kept your saved work and will continue after more work capacity is available."
      : "Claudia has kept your saved work and will continue when you resume her.";
    primaryAction = pausedAction(input.agent);
  } else if (ownerRequest) {
    status = "waiting_for_user";
    headline = "Claudia needs one decision";
    explanation = ownerRequest.reason;
  } else if (input.agent.presence.isWorking) {
    status = "working";
    ({ headline, explanation } = workingCopy(input.agent));
  } else {
    status = "on_track";
    headline = "Everything is on track";
    explanation =
      "Claudia has finished the current work and will continue monitoring your brand for the next useful opportunity.";
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
    weeklySummary: buildWeeklySummary(input.automation),
    recentContent: buildRecentContent(input.articles, input.automation.autoPublish),
    resultHighlights: [
      googleHighlight(input.traffic),
      aiHighlight(input.answers),
      healthHighlight(input.summary),
    ],
    activityHref: "/activity",
  };
}
