/**
 * Client-safe Ask types + intent chips + free-text routing.
 * Server answer assembly lives in `ask.ts` (structured DB reads only).
 */

export const ASK_INTENTS = [
  {
    id: "current_objective",
    label: "What are you working toward?",
    keywords: ["objective", "goal", "target", "baseline", "success condition", "metric"],
  },
  {
    id: "current_plan",
    label: "Why did you choose this work?",
    keywords: ["current plan", "strategy", "plan rationale", "why this plan", "planned work"],
  },
  {
    id: "action_history",
    label: "What have you completed?",
    keywords: [
      "action history",
      "actions taken",
      "actions have you taken",
      "what actions",
      "changed",
      "applied",
      "verified",
      "remote change",
    ],
  },
  {
    id: "week_summary",
    label: "What improved this week?",
    keywords: ["this week", "what did you", "summary", "update", "progress", "status report"],
  },
  {
    id: "blocking_scores",
    label: "What should improve next?",
    keywords: [
      "block",
      "blocking",
      "score",
      "higher score",
      "issue",
      "problem",
      "improve score",
      "visibility score",
      "audit",
    ],
  },
  {
    id: "writing_next",
    label: "What will you create next?",
    keywords: ["writing next", "write next", "article", "topic queue", "content queue", "publish next"],
  },
  {
    id: "ai_answers",
    label: "Where do AI assistants mention us?",
    keywords: ["chatgpt", "perplexity", "gemini", "ai answer", "mention", "cited", "assistant"],
  },
  {
    id: "fixes_ready",
    label: "What needs my attention?",
    keywords: ["approve", "approval", "inbox", "need me", "waiting on me", "needs my", "ready for me"],
  },
  {
    id: "status",
    label: "What are you working on today?",
    keywords: ["working right now", "busy", "paused", "schedule", "next run", "alive"],
  },
] as const;

export type AskIntentId = (typeof ASK_INTENTS)[number]["id"];

export const ASK_INTENT_IDS = ASK_INTENTS.map((i) => i.id) as [
  AskIntentId,
  ...AskIntentId[],
];

export type AskSource = { label: string; href: string };

export type AskRecordRef = {
  kind:
    | "objective"
    | "plan"
    | "task"
    | "event"
    | "action"
    | "topic"
    | "finding"
    | "audit"
    | "answer_run"
    | "usage_counter"
    | "publication"
    | "publication_gate";
  id: string;
  label: string;
  href?: string;
};

export type AskWeekSummaryFacts = {
  weeklyUsage: { articlesWritten: number; articlesPublished: number } | null;
  visibility: { score: number; delta: number | null } | null;
  aiAnswers: { appeared: number; total: number } | null;
  topFindings: Array<{ severity: string; title: string }>;
  latestAction: {
    actionType: string;
    resourceRef: string;
    status: string;
    verificationStatus: string;
    createdAt: string;
  } | null;
};

/** Deterministic summary text assembled only from the structured rows cited by the server. */
export function formatAskWeekSummary(facts: AskWeekSummaryFacts): string {
  const paragraphs: string[] = [];
  const usage = facts.weeklyUsage;
  paragraphs.push(
    usage
      ? `This week: ${usage.articlesWritten} article${usage.articlesWritten === 1 ? "" : "s"} written and ${usage.articlesPublished} published.`
      : "No new content has been completed this week yet.",
  );

  if (facts.visibility) {
    const { score, delta } = facts.visibility;
    paragraphs.push(
      delta == null
        ? `Online discovery health is ${score}. This is the first reliable baseline.`
        : `Online discovery health is ${score}, ${delta === 0 ? "unchanged" : `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} points`}.`,
    );
  }

  if (facts.aiAnswers) {
    const { appeared, total } = facts.aiAnswers;
    paragraphs.push(
      `Your brand appeared in ${appeared} of ${total} tracked AI-answer check${total === 1 ? "" : "s"}.`,
    );
  }

  if (facts.topFindings.length > 0) {
    paragraphs.push(
      `The most important things to improve are: ${facts.topFindings
        .map((finding) => finding.title)
        .join("; ")}.`,
    );
  }

  if (facts.latestAction) {
    const action = facts.latestAction;
    paragraphs.push(
      `Latest live change (${action.createdAt.slice(0, 10)}): ${action.actionType.replace(/[._-]/g, " ")} is ${action.status}, with the result ${action.verificationStatus}.`,
    );
  }

  return paragraphs.join("\n\n");
}

export type AskAnswer = {
  intent: AskIntentId;
  answer: string;
  sources: AskSource[];
  recordRefs: AskRecordRef[];
};

export type AskProposal = {
  proposal: true;
  applied: false;
  answer: string;
  requestedChange: string;
  route: { kind: "plan_review"; label: string; href: string };
  sources: AskSource[];
  recordRefs: AskRecordRef[];
};

export type AskRouted = {
  routed: true;
  applied: false;
  answer: string;
  route: {
    kind: "policy" | "steering";
    label: string;
    href: string;
  };
  sources: AskSource[];
  recordRefs: AskRecordRef[];
};

export type AskUnknown = {
  unknown: true;
  suggestion: string;
  intents: { id: AskIntentId; label: string }[];
};

export type AskResult = AskAnswer | AskProposal | AskRouted | AskUnknown;

export function isAskIntentId(value: string): value is AskIntentId {
  return ASK_INTENTS.some((i) => i.id === value);
}

export function isAskUnknown(r: AskResult): r is AskUnknown {
  return "unknown" in r && r.unknown === true;
}

export function isAskProposal(r: AskResult): r is AskProposal {
  return "proposal" in r && r.proposal === true;
}

export function isAskRouted(r: AskResult): r is AskRouted {
  return "routed" in r && r.routed === true;
}

export function askIntentChips(): { id: AskIntentId; label: string }[] {
  return ASK_INTENTS.map((i) => ({ id: i.id, label: i.label }));
}

/**
 * Keyword routing for free text. Requires a minimum score and a margin over the
 * runner-up so ambiguous phrases fall through to `unknown`.
 */
export function resolveAskIntent(message: string): AskIntentId | null {
  const q = message.trim().toLowerCase();
  if (!q) return null;

  const scored: { id: AskIntentId; score: number }[] = [];
  for (const intent of ASK_INTENTS) {
    let score = 0;
    for (const kw of intent.keywords) {
      if (q.includes(kw)) score += kw.length;
    }
    if (score > 0) scored.push({ id: intent.id, score });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!;
  const second = scored[1];
  const MIN_SCORE = 5;
  const MIN_MARGIN = 2;
  if (best.score < MIN_SCORE) return null;
  if (second && best.score - second.score < MIN_MARGIN) return null;
  return best.id;
}

export type AskActionRequest = "plan_change" | "policy" | "live_action";

/**
 * Keep mutating requests out of the read-only answer path. The UI can route
 * them to the reviewed plan or policy surfaces without applying anything.
 */
export function resolveAskActionRequest(message: string): AskActionRequest | null {
  const value = message.trim().toLowerCase();
  if (!value) return null;

  if (
    /\b(reorder|remove|drop|move|reprioriti[sz]e|prioriti[sz]e|deprioriti[sz]e|change|revise|constrain)\b/.test(
      value,
    ) &&
    /\b(plan|strategy|task|work|priority|focus)\b/.test(value)
  ) {
    return "plan_change";
  }
  if (
    /\b(grant|revoke|allow|permission|authority|autonomy|always allow|never allow)\b/.test(
      value,
    )
  ) {
    return "policy";
  }
  if (
    /\b(publish|delete|apply|install|pause|resume|approve|reject|connect|disconnect|run now|start now|stop now)\b/.test(
      value,
    )
  ) {
    return "live_action";
  }
  return null;
}
