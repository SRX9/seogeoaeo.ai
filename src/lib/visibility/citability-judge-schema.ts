import { z } from "zod";

/**
 * V2.1 (v3): Zod schema for the LLM semantic-citability judgement. The judge
 * scores how likely an AI assistant is to *cite* each passage when answering a
 * question: the semantic complement to the deterministic structural scorer.
 * This never feeds the 0-100 sub-score; it only enriches findings.
 */
export const CitabilityJudgeSchema = z.object({
  blocks: z.array(
    z.object({
      index: z.number().int(),
      semantic_score: z.number().min(0).max(100),
      reasons: z.array(z.string()).max(3),
    }),
  ),
});

export type CitabilityJudgeJson = z.infer<typeof CitabilityJudgeSchema>;
