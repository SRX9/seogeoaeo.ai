import { describe, expect, it } from "vitest";
import { buildQuestionOutline, dedupeQuestions } from "./paa";

describe("dedupeQuestions", () => {
  it("normalizes, appends '?', and drops near-duplicates", () => {
    const out = dedupeQuestions([
      "what is geo",
      "What is GEO?",
      "what is geo optimization",
      "How much does it cost?",
    ]);
    expect(out).toContain("what is geo?");
    // "what is geo optimization" contains "what is geo" → dropped as a near-dup.
    expect(out.filter((q) => q.toLowerCase().startsWith("what is geo"))).toHaveLength(1);
    expect(out).toContain("How much does it cost?");
  });
});

describe("buildQuestionOutline", () => {
  it("maps deduped questions to headings + citability-scored answer targets", async () => {
    const draft = async (q: string) =>
      `${q.replace("?", "")} is a concrete, self-contained answer. According to a 2024 study, 62% of teams saw measurable gains, which shows the direct value of the approach for most readers today.`;
    const outline = await buildQuestionOutline("GEO", {
      questions: ["What is GEO?", "what is geo?", "How do I start with GEO?"],
      draft,
      max: 5,
    });
    expect(outline.topic).toBe("GEO");
    expect(outline.items).toHaveLength(2); // duplicate collapsed
    for (const item of outline.items) {
      expect(item.heading[0]).toBe(item.heading[0].toUpperCase());
      expect(item.answerTarget.length).toBeGreaterThan(0);
      expect(typeof item.citability).toBe("number");
    }
    // The data-rich draft should score above zero citability.
    expect(outline.items[0].citability).toBeGreaterThan(0);
  });
});
