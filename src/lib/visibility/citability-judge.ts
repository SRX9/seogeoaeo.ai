import { generateJson } from "@/lib/llm/client";
import type { PassageScore } from "./citability";
import { CitabilityJudgeSchema } from "./citability-judge-schema";

/**
 * V2.1 (v3): LLM semantic-citability judge. The deterministic scorer measures
 * structure (answer-first, self-contained, fact-dense); this measures *meaning*
 *: would an AI assistant actually cite this passage to answer a question. One
 * batched `light` call over ≤10 pre-selected blocks. Best-effort: returns null
 * when the LLM is unavailable or the response doesn't validate, so the audit
 * degrades to the deterministic score alone. Never feeds the 0-100 sub-score.
 */

export const MAX_JUDGE_BLOCKS = 10;

export interface SemanticJudgement {
  index: number;
  semantic_score: number;
  reasons: string[];
}

/** Injectable generator (defaults to the shared LLM client; stubbed in tests). */
export type JudgeFn = (
  tier: "light" | "heavy",
  messages: { role: "system" | "user" | "assistant"; content: string }[],
) => Promise<{ data: unknown }>;

const SYSTEM = [
  "You judge how likely an AI assistant (ChatGPT, Claude, Perplexity) is to CITE each passage",
  "when answering a user's question. A highly citable passage directly answers a specific question,",
  "is self-contained (understandable without surrounding context), states concrete verifiable facts,",
  "and is quotable as-is. Score each passage 0-100 and give up to 3 short reasons.",
  'Return JSON: {"blocks":[{"index":N,"semantic_score":0-100,"reasons":["..."]}]} using the given indices.',
].join(" ");

function buildUserMessage(blocks: PassageScore[]): string {
  return blocks
    .map((b, i) => `[${i}] heading: ${b.heading ?? "(none)"}\n${b.preview}`)
    .join("\n\n");
}

/**
 * Judge up to `MAX_JUDGE_BLOCKS` passages. The caller pre-selects which blocks
 * matter (e.g. the page's strongest + weakest); the index in the returned
 * judgements maps back to the input array position.
 */
export async function judgeCitability(
  blocks: PassageScore[],
  opts: { generate?: JudgeFn } = {},
): Promise<SemanticJudgement[] | null> {
  const capped = blocks.slice(0, MAX_JUDGE_BLOCKS);
  if (capped.length === 0) return null;
  try {
    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: buildUserMessage(capped) },
    ] as const;
    const { data } = opts.generate
      ? await opts.generate("light", [...messages])
      : await generateJson("light", [...messages], { schema: CitabilityJudgeSchema });
    const parsed = CitabilityJudgeSchema.safeParse(data);
    if (!parsed.success) return null;
    // Drop hallucinated / out-of-range indices.
    return parsed.data.blocks.filter((b) => b.index >= 0 && b.index < capped.length);
  } catch {
    return null;
  }
}
