/**
 * Client-safe Ask types + intent chips + free-text routing.
 * Server answer assembly lives in `ask.ts` (DB / brief reads only).
 */

export const ASK_INTENTS = [
  {
    id: "week_summary",
    label: "What did you do this week?",
    keywords: ["this week", "what did you", "summary", "update", "progress", "status report"],
  },
  {
    id: "blocking_scores",
    label: "What's blocking higher scores?",
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
    label: "What are you writing next?",
    keywords: ["writing next", "write next", "article", "topic queue", "content queue", "publish next"],
  },
  {
    id: "ai_answers",
    label: "Where do AI assistants mention us?",
    keywords: ["chatgpt", "perplexity", "gemini", "ai answer", "mention", "cited", "assistant"],
  },
  {
    id: "fixes_ready",
    label: "What needs my approval?",
    keywords: ["approve", "approval", "inbox", "need me", "waiting on me", "needs my", "ready for me"],
  },
  {
    id: "status",
    label: "Are you working right now?",
    keywords: ["working right now", "are you working", "busy", "paused", "schedule", "next run", "alive"],
  },
] as const;

export type AskIntentId = (typeof ASK_INTENTS)[number]["id"];

export const ASK_INTENT_IDS = ASK_INTENTS.map((i) => i.id) as [
  AskIntentId,
  ...AskIntentId[],
];

export type AskSource = { label: string; href: string };

export type AskAnswer = {
  intent: AskIntentId;
  answer: string;
  sources: AskSource[];
};

export type AskUnknown = {
  unknown: true;
  suggestion: string;
  intents: { id: AskIntentId; label: string }[];
};

export type AskResult = AskAnswer | AskUnknown;

export function isAskIntentId(value: string): value is AskIntentId {
  return ASK_INTENTS.some((i) => i.id === value);
}

export function isAskUnknown(r: AskResult): r is AskUnknown {
  return "unknown" in r && r.unknown === true;
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
