import { z } from "zod";
import { generateJson } from "@/lib/llm/client";
import type { PassageScore } from "./citability";

/**
 * V2.1 — LLM `light` rewrite suggestions for weak citability blocks. Kept in a
 * separate module from the deterministic scorer: this never feeds back into the
 * 0–100 score. Best-effort — returns [] when the LLM is unavailable.
 */

/** Blocks below this deterministic score are candidates for a rewrite. */
export const WEAK_BLOCK_THRESHOLD = 60;

export interface RewriteSuggestion {
  heading: string | null;
  current_score: number;
  /** A stronger opening sentence that leads with the answer. */
  suggested_opening: string;
  /** Concrete, specific edits (add a stat, define the term, tighten length). */
  fixes: string[];
}

const SCHEMA = z.object({
  suggested_opening: z.string(),
  fixes: z.array(z.string()).max(5),
});

const SYSTEM = [
  "You optimize content passages for AI citability (being quoted by AI assistants).",
  "Highly citable passages: lead with a direct answer in the first sentence, are self-contained",
  "(no vague pronouns), 134–167 words, and include a specific statistic or named source.",
  'Return JSON: {"suggested_opening": "<one sentence>", "fixes": ["<edit>", ...]} with ≤5 fixes.',
].join(" ");

/** Generate a rewrite suggestion for a single weak passage. */
export async function suggestRewrite(
  block: PassageScore,
  content: string,
): Promise<RewriteSuggestion | null> {
  try {
    const { data } = await generateJson<unknown>("light", [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Heading: ${block.heading ?? "(none)"}\nCitability: ${block.total_score}/100\nPassage:\n${content.slice(0, 1500)}`,
      },
    ]);
    const parsed = SCHEMA.safeParse(data);
    if (!parsed.success) return null;
    return {
      heading: block.heading,
      current_score: block.total_score,
      suggested_opening: parsed.data.suggested_opening,
      fixes: parsed.data.fixes,
    };
  } catch {
    return null;
  }
}
