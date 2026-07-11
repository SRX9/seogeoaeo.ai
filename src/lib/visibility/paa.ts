import { generateText } from "@/lib/llm/client";
import { serperSearch } from "@/lib/research/serper";
import { scorePassage } from "./citability";

/**
 * V5.4: "People Also Ask" targeting. Mine the real questions users ask for a
 * topic, dedupe them, and map each to a question-style heading + a 40-60 word
 * direct-answer target (the answer-block pattern from geo-platform-analysis.md
 * Step 1). Each answer target is scored with the V2.1 citability scorer so the
 * writer drafts toward high-citability shapes. The outline feeds the writer.
 */

export interface OutlineItem {
  question: string;
  heading: string;
  answerTarget: string;
  /** V2.1 citability score of the drafted answer target. */
  citability: number;
}

export interface QuestionOutline {
  topic: string;
  items: OutlineItem[];
}

export type DraftAnswer = (question: string, topic: string) => Promise<string>;

/** Default drafter: LLM `light`, 40-60 words, answer-first. Falls back to a stub. */
const llmDraft: DraftAnswer = async (question, topic) => {
  try {
    const { text } = await generateText("light", [
      {
        role: "system",
        content:
          "Write a direct 40-60 word answer to the question, leading with the key fact. " +
          "Self-contained, specific, no preamble. Plain text only.",
      },
      { role: "user", content: `Topic: ${topic}\nQuestion: ${question}` },
    ]);
    return text.trim();
  } catch {
    return `${question.replace(/\?$/, "")}: [draft a 40-60 word direct answer leading with the key fact].`;
  }
};

/** Normalize + dedupe questions (drop near-duplicates by substring containment). */
export function dedupeQuestions(raw: string[]): string[] {
  const kept: string[] = [];
  for (const q of raw) {
    const question = q.trim().replace(/\s+/g, " ");
    if (question.length < 8) continue;
    const norm = question.toLowerCase().replace(/[?.!]+$/, "");
    if (kept.some((k) => k.toLowerCase().replace(/[?.!]+$/, "") === norm)) continue;
    // Drop if one is contained in the other (same intent, different phrasing).
    if (kept.some((k) => k.toLowerCase().includes(norm) || norm.includes(k.toLowerCase().replace(/[?.!]+$/, "")))) continue;
    kept.push(question.endsWith("?") ? question : `${question}?`);
  }
  return kept;
}

export async function buildQuestionOutline(
  topic: string,
  opts: { questions?: string[]; draft?: DraftAnswer; max?: number } = {},
): Promise<QuestionOutline> {
  const draft = opts.draft ?? llmDraft;
  const max = opts.max ?? 8;

  const raw =
    opts.questions ??
    (await serperSearch(topic))
      .peopleAlsoAsk.map((p) => p.question ?? "")
      .filter(Boolean);
  const questions = dedupeQuestions(raw).slice(0, max);

  const items = await Promise.all(
    questions.map(async (question): Promise<OutlineItem> => {
      const heading = question[0].toUpperCase() + question.slice(1);
      const answerTarget = await draft(question, topic);
      return { question, heading, answerTarget, citability: scorePassage(answerTarget, heading).total_score };
    }),
  );

  return { topic, items };
}
