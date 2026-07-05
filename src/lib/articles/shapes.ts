/**
 * C3 shape library: the outline step picks a shape from the topic's intent and
 * the article follows it. The intro→three-sections→conclusion essay is not in
 * the library — it is unreachable by design.
 */

export type ArticleShape =
  | "direct-answer"
  | "tutorial"
  | "comparison"
  | "opinion"
  | "checklist"
  | "teardown";

export const ARTICLE_SHAPES: Record<ArticleShape, { when: string; skeleton: string }> = {
  "direct-answer": {
    when: "question-intent topics (AEO)",
    skeleton:
      "Open with the answer itself in 40-60 words — a reader who leaves after the first " +
      "paragraph should leave satisfied. Then go deeper for the readers who want the " +
      "reasoning, edge cases, and specifics. No introduction before the answer.",
  },
  tutorial: {
    when: '"how to [job]" topics',
    skeleton:
      "Prerequisites first (one short list), then numbered steps with a real, concrete " +
      "example carried through, then a short section on what usually goes wrong. " +
      "No intro essay — the first line says what the reader will have working by the end.",
  },
  comparison: {
    when: '"X vs Y" and "Y alternative" topics',
    skeleton:
      "Verdict first: who should pick which, in the opening paragraph. Then a comparison " +
      "table, then the honest tradeoffs — praise the competitor where they are genuinely " +
      "better; trust is the conversion asset. End with the one-line recommendation per buyer type.",
  },
  opinion: {
    when: "takes and industry commentary",
    skeleton:
      "One claim with a spine, stated in the first sentence and argued in first person. " +
      "Steelman the counterargument once, then answer it. The kind of post that gets quoted. " +
      "End on the sharpest version of the take, not a summary.",
  },
  checklist: {
    when: "audits, launches, setups",
    skeleton:
      "A scannable list of checks. Each item is one imperative line plus a one-line " +
      '"why it matters". Group items only if there are more than ten. No prose sections.',
  },
  teardown: {
    when: "examples and case studies",
    skeleton:
      "Walk one real example start to finish — what they did, the actual numbers or " +
      "artifacts, then extract the transferable lessons as short takeaways. " +
      "The example is the article; the lessons earn their place at the end.",
  },
};

type ShapeInput = {
  title: string;
  keywords?: string | null;
  query?: string | null;
};

/**
 * Deterministic intent → shape mapping over the topic's own words. Order
 * matters: comparison catches "X vs Y" before the question check would,
 * tutorial claims "how to" before direct-answer claims "how do I".
 */
export function pickShape(topic: ShapeInput): ArticleShape {
  const text = [topic.title, topic.keywords, topic.query]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\bvs\.?\b|\bversus\b|\balternatives?\b|\bcompared? (to|with)\b/.test(text)) {
    return "comparison";
  }
  if (/\bhow to\b|\bstep[- ]by[- ]step\b|\bsetting up\b|\bset up\b|\bgetting started\b/.test(text)) {
    return "tutorial";
  }
  if (/\bchecklist\b|\baudit\b|\bbefore you (launch|ship|publish)\b/.test(text)) {
    return "checklist";
  }
  if (/\bcase stud(y|ies)\b|\bteardown\b|\bexamples? of\b|\blessons from\b|\bbreakdown of\b/.test(text)) {
    return "teardown";
  }
  if (/\bwhy .+ (is|are) (wrong|dead|broken|overrated)\b|\bhot take\b|\bunpopular opinion\b|\bthe (future|state|end) of\b/.test(text)) {
    return "opinion";
  }
  // Everything else answers a question — the safest default for a product whose
  // whole thesis is answer-first content. Never the essay.
  return "direct-answer";
}
