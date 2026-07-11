/**
 * V6.6: the single source of truth for AI-assistant referrer domains. Used by
 * the GA4 pull (to filter sessions) and by the proof panel (to label per-engine
 * referral bars). Keep this list here only.
 */

export const AI_REFERRERS: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "openai.com": "ChatGPT",
  "perplexity.ai": "Perplexity",
  "gemini.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "bing.com": "Copilot",
  "claude.ai": "Claude",
  "you.com": "You.com",
};

export const AI_ENGINES = [...new Set(Object.values(AI_REFERRERS))];

/** Map a referrer host/URL to its AI engine label, or null if not an AI surface. */
export function classifyReferrer(referrer: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer.includes("://") ? referrer : `https://${referrer}`).hostname.toLowerCase();
  } catch {
    host = referrer.toLowerCase();
  }
  host = host.replace(/^www\./, "");
  for (const [domain, engine] of Object.entries(AI_REFERRERS)) {
    if (host === domain || host.endsWith(`.${domain}`)) return engine;
  }
  return null;
}

/** Aggregate raw {referrer, sessions} rows into per-engine AI-referral counts. */
export function aggregateAiReferrals(rows: { referrer: string; sessions: number }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const engine = classifyReferrer(row.referrer);
    if (!engine) continue;
    counts[engine] = (counts[engine] ?? 0) + row.sessions;
  }
  return counts;
}
