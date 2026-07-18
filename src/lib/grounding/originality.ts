export const ORIGINALITY_EVALUATOR_VERSION = "content-originality.v1";

export type ProposedOriginalityContent = {
  title: string;
  body: string;
  keywords?: readonly string[];
  intent?: string | null;
  distinctThesis?: string | null;
  originalBrandEvidence?: readonly string[];
  usefulFramework?: string | null;
};

export type ExistingBrandContent = {
  id: string;
  title: string;
  body?: string | null;
  keywords?: readonly string[];
  intent?: string | null;
};

export type RetrievedSearchTheme = {
  id: string;
  text: string;
};

export type OriginalityInput = {
  proposed: ProposedOriginalityContent;
  existingBrandContent?: readonly ExistingBrandContent[];
  searchThemes?: readonly RetrievedSearchTheme[];
};

export type OriginalityComparison = {
  referenceType: "brand_content" | "search_theme";
  referenceId: string;
  titleSimilarity: number;
  bodySimilarity: number;
  sharedKeywords: string[];
  cannibalizationRisk: boolean;
  thinParaphraseRisk: boolean;
};

export type OriginalityEvaluation = {
  passed: boolean;
  evaluatorVersion: typeof ORIGINALITY_EVALUATOR_VERSION;
  originalityPassed: boolean;
  cannibalizationPassed: boolean;
  informationGainSignals: Array<
    "distinct_thesis" | "original_brand_evidence" | "useful_framework"
  >;
  comparisons: OriginalityComparison[];
  blockingReasons: string[];
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "which",
  "with",
  "you",
  "your",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9%$]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function overlapCoefficient(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const denominator = Math.min(leftSet.size, rightSet.size);
  if (denominator === 0) return 0;
  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) shared += 1;
  }
  return shared / denominator;
}

function cosineSimilarity(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftCounts = new Map<string, number>();
  const rightCounts = new Map<string, number>();
  for (const token of left) leftCounts.set(token, (leftCounts.get(token) ?? 0) + 1);
  for (const token of right) rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (const count of leftCounts.values()) leftMagnitude += count * count;
  for (const count of rightCounts.values()) rightMagnitude += count * count;
  for (const [token, count] of leftCounts) {
    dot += count * (rightCounts.get(token) ?? 0);
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function normalizeKeyword(value: string): string {
  return tokens(value).join(" ");
}

function sharedKeywords(
  proposed: readonly string[] | undefined,
  existing: readonly string[] | undefined,
): string[] {
  const existingNormalized = new Set((existing ?? []).map(normalizeKeyword).filter(Boolean));
  return [...new Set((proposed ?? []).map(normalizeKeyword).filter(Boolean))].filter((keyword) =>
    existingNormalized.has(keyword),
  );
}

function contributionAppearsInBody(value: string | null | undefined, bodyTokens: string[]): boolean {
  if (!value) return false;
  const contributionTokens = tokens(value);
  return (
    contributionTokens.length >= 3 && overlapCoefficient(contributionTokens, bodyTokens) >= 0.75
  );
}

function informationGainSignals(
  proposed: ProposedOriginalityContent,
): OriginalityEvaluation["informationGainSignals"] {
  const bodyTokens = tokens(proposed.body);
  const signals: OriginalityEvaluation["informationGainSignals"] = [];
  if (contributionAppearsInBody(proposed.distinctThesis, bodyTokens)) {
    signals.push("distinct_thesis");
  }
  if (
    (proposed.originalBrandEvidence ?? []).some((evidence) =>
      contributionAppearsInBody(evidence, bodyTokens),
    )
  ) {
    signals.push("original_brand_evidence");
  }
  if (contributionAppearsInBody(proposed.usefulFramework, bodyTokens)) {
    signals.push("useful_framework");
  }
  return signals;
}

/**
 * Flags only strong lexical duplication. A declared information-gain signal is
 * counted only when its substance is present in the proposed body.
 */
export function evaluateOriginality(input: OriginalityInput): OriginalityEvaluation {
  const proposed = input.proposed;
  const proposedTitleTokens = tokens(proposed.title);
  const proposedBodyTokens = tokens(proposed.body);
  const gains = informationGainSignals(proposed);

  const brandComparisons: OriginalityComparison[] = (input.existingBrandContent ?? []).map(
    (existing) => {
      const titleSimilarity = overlapCoefficient(proposedTitleTokens, tokens(existing.title));
      const bodySimilarity = cosineSimilarity(proposedBodyTokens, tokens(existing.body ?? ""));
      const keywords = sharedKeywords(proposed.keywords, existing.keywords);
      const sameDeclaredIntent =
        proposed.intent != null &&
        existing.intent != null &&
        normalizeText(proposed.intent) === normalizeText(existing.intent);
      const cannibalizationRisk =
        titleSimilarity >= 0.8 ||
        bodySimilarity >= 0.86 ||
        (keywords.length > 0 && (sameDeclaredIntent || titleSimilarity >= 0.55));
      return {
        referenceType: "brand_content" as const,
        referenceId: existing.id,
        titleSimilarity,
        bodySimilarity,
        sharedKeywords: keywords,
        cannibalizationRisk,
        thinParaphraseRisk: bodySimilarity >= 0.74,
      };
    },
  );

  const themeComparisons: OriginalityComparison[] = (input.searchThemes ?? []).map((theme) => {
    const themeTokens = tokens(theme.text);
    const bodySimilarity = cosineSimilarity(proposedBodyTokens, themeTokens);
    return {
      referenceType: "search_theme" as const,
      referenceId: theme.id,
      titleSimilarity: overlapCoefficient(proposedTitleTokens, themeTokens),
      bodySimilarity,
      sharedKeywords: [],
      cannibalizationRisk: false,
      // Short search themes describe a topic, not enough prose to prove copying.
      thinParaphraseRisk: themeTokens.length >= 8 && bodySimilarity >= 0.78,
    };
  });

  const comparisons = [...brandComparisons, ...themeComparisons];
  const hardDuplicate = comparisons.some(
    (comparison) =>
      comparison.referenceType === "brand_content" && comparison.bodySimilarity >= 0.92,
  );
  const informationGainPresent = gains.length > 0;
  const originalityPassed =
    informationGainPresent && !comparisons.some((comparison) => comparison.thinParaphraseRisk);
  const cannibalizationPassed =
    !brandComparisons.some((comparison) => comparison.cannibalizationRisk) && !hardDuplicate;
  const blockingReasons: string[] = [];
  if (!originalityPassed) {
    blockingReasons.push(
      informationGainPresent
        ? "The draft is a thin paraphrase of existing content or search themes."
        : "The draft has no verified distinct thesis, original brand evidence, or useful framework.",
    );
  }
  if (!cannibalizationPassed) {
    blockingReasons.push("The draft would obviously cannibalize an existing brand article.");
  }

  return {
    passed: blockingReasons.length === 0,
    evaluatorVersion: ORIGINALITY_EVALUATOR_VERSION,
    originalityPassed,
    cannibalizationPassed,
    informationGainSignals: gains,
    comparisons,
    blockingReasons,
  };
}
