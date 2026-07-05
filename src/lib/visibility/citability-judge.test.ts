import { describe, expect, it } from "vitest";
import type { PassageScore } from "./citability";
import { type JudgeFn, judgeCitability, MAX_JUDGE_BLOCKS } from "./citability-judge";

function block(heading: string | null, score = 50): PassageScore {
  return {
    heading,
    word_count: 120,
    total_score: score,
    grade: "C",
    label: "Moderate Citability",
    breakdown: {
      answer_block_quality: 0,
      self_containment: 0,
      structural_readability: 0,
      statistical_density: 0,
      uniqueness_signals: 0,
    },
    preview: `${heading ?? "intro"} preview text...`,
  };
}

// Injectable generator that returns whatever JSON we hand it.
const gen = (data: unknown): JudgeFn => async () => ({ data });

describe("judgeCitability", () => {
  it("returns validated judgements for each block", async () => {
    const r = await judgeCitability([block("A"), block("B")], {
      generate: gen({
        blocks: [
          { index: 0, semantic_score: 82, reasons: ["direct answer", "self-contained"] },
          { index: 1, semantic_score: 30, reasons: ["vague"] },
        ],
      }),
    });
    expect(r).toEqual([
      { index: 0, semantic_score: 82, reasons: ["direct answer", "self-contained"] },
      { index: 1, semantic_score: 30, reasons: ["vague"] },
    ]);
  });

  it("returns null when the LLM output does not validate", async () => {
    const r = await judgeCitability([block("A")], { generate: gen({ nope: true }) });
    expect(r).toBeNull();
  });

  it("returns null when the generator throws", async () => {
    const r = await judgeCitability([block("A")], {
      generate: async () => {
        throw new Error("LLM down");
      },
    });
    expect(r).toBeNull();
  });

  it("returns null for an empty block list (no LLM call)", async () => {
    let called = false;
    const r = await judgeCitability([], {
      generate: async () => {
        called = true;
        return { data: {} };
      },
    });
    expect(r).toBeNull();
    expect(called).toBe(false);
  });

  it("drops hallucinated out-of-range indices", async () => {
    const r = await judgeCitability([block("A"), block("B")], {
      generate: gen({
        blocks: [
          { index: 0, semantic_score: 70, reasons: [] },
          { index: 9, semantic_score: 90, reasons: ["made up"] }, // no such block
        ],
      }),
    });
    expect(r).toEqual([{ index: 0, semantic_score: 70, reasons: [] }]);
  });

  it("only judges the first MAX_JUDGE_BLOCKS blocks", async () => {
    const many = Array.from({ length: 15 }, (_, i) => block(`H${i}`));
    let sentCount = 0;
    await judgeCitability(many, {
      generate: async (_tier, messages) => {
        // count the block indices present in the user message
        sentCount = (messages[1].content.match(/^\[\d+\]/gm) ?? []).length;
        return { data: { blocks: [] } };
      },
    });
    expect(sentCount).toBe(MAX_JUDGE_BLOCKS);
  });
});
