import { generateText } from "@/lib/llm/client";
import { scorePassage } from "./citability";

/**
 * V6.5: answer-block & featured-snippet optimizer (shared with V7.1/V7.2).
 * Rewrites a section into the shape answer engines extract (a 40-60 word direct
 * answer first, then structured detail) and ships it ONLY if the deterministic
 * V2.1 citability score improves. The score is the gate: never trust the LLM
 * blindly. Pattern from geo-platform-analysis.md Step 1.
 */

export type SnippetShape = "paragraph" | "list" | "table";

export interface AnswerBlock {
  heading: string | null;
  content: string;
}

export interface AnswerFix {
  heading: string | null;
  shape: SnippetShape;
  before: number;
  after: number;
  improved: boolean;
  rewrite: string | null;
  explanation: string;
  /** Set only when the rewrite raises citability: drives V7.2 apply. */
  fixPayload: { kind: "answer_block"; heading: string | null; rewrite: string } | null;
}

export type RewriteFn = (block: AnswerBlock & { shape: SnippetShape }) => Promise<string>;

/** Infer the snippet shape the content deserves. */
export function detectShape(content: string): SnippetShape {
  if (/\b(vs\.?|versus|compared? to|comparison)\b/i.test(content) && /\d/.test(content)) return "table";
  if (/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s|\b(?:first|second|third|steps?|tips?)\b/i.test(content)) return "list";
  return "paragraph";
}

const SYSTEM = [
  "You rewrite a content section to be maximally citable by AI answer engines.",
  "Lead with a direct, self-contained answer of 40-60 words that stands alone.",
  "Then add structured detail (a short list, steps, or table) matching the requested shape.",
  "Keep every fact and citation intact. Do not invent statistics. Plain text/markdown only.",
].join(" ");

const llmRewrite: RewriteFn = async ({ heading, content, shape }) => {
  const { text } = await generateText("heavy", [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Heading: ${heading ?? "(none)"}\nDesired shape: ${shape}\n\nSection:\n${content}` },
  ]);
  return text.trim();
};

/**
 * Rewrite a block and return the fix only if citability improves. When the LLM
 * fails or the rewrite doesn't help, keep the original and explain.
 */
export async function optimizeAnswerBlock(
  block: AnswerBlock,
  opts: { rewrite?: RewriteFn } = {},
): Promise<AnswerFix> {
  const rewriteFn = opts.rewrite ?? llmRewrite;
  const shape = detectShape(block.content);
  const before = scorePassage(block.content, block.heading).total_score;

  let rewrite: string | null = null;
  try {
    rewrite = await rewriteFn({ ...block, shape });
  } catch {
    rewrite = null;
  }

  const after = rewrite ? scorePassage(rewrite, block.heading).total_score : before;
  const improved = rewrite != null && after > before;

  return {
    heading: block.heading,
    shape,
    before,
    after: improved ? after : before,
    improved,
    rewrite: improved ? rewrite : null,
    explanation: improved
      ? `Answer-first rewrite raised citability ${before} → ${after}.`
      : rewrite
        ? `Kept the original: the rewrite (${after}) didn't beat the current score (${before}).`
        : "Could not generate a rewrite; original kept.",
    fixPayload: improved && rewrite ? { kind: "answer_block", heading: block.heading, rewrite } : null,
  };
}
