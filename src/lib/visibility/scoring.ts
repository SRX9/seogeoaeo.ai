import { scoreBand } from "./display";
import type { SubScore } from "./types";

/**
 * V2.3: composite scoring. Weights + bands are the source of truth from
 * `inspiration-code/docs/scoring-methodology.md` (composite 27-33, bands 53-59)
 * and `agents/geo-ai-visibility.md` Step 7 (AI-visibility sub-composite).
 * Missing analyzers are excluded and measured weights are normalized. A
 * provider failure must never masquerade as a measured score of zero.
 */

export const COMPOSITE_WEIGHTS: Record<SubScore["key"], number> = {
  citability: 0.25,
  brand: 0.2,
  eeat: 0.2,
  technical: 0.15,
  schema: 0.1,
  platform: 0.1,
};

export interface Composite {
  overall: number;
  band: string;
  /** Sub-scores that haven't run yet: surfaced as "not yet measured". */
  notMeasured: SubScore["key"][];
}

export function computeComposite(subScores: SubScore[]): Composite {
  const map = new Map(subScores.map((s) => [s.key, s.score]));
  let overall = 0;
  let measuredWeight = 0;
  const notMeasured: SubScore["key"][] = [];
  for (const key of Object.keys(COMPOSITE_WEIGHTS) as SubScore["key"][]) {
    const score = map.get(key);
    if (score == null) {
      notMeasured.push(key);
      continue;
    }
    measuredWeight += COMPOSITE_WEIGHTS[key];
    overall += COMPOSITE_WEIGHTS[key] * score;
  }
  const rounded = measuredWeight > 0 ? Math.round(overall / measuredWeight) : 0;
  return { overall: rounded, band: scoreBand(rounded), notMeasured };
}

export const AI_VISIBILITY_WEIGHTS = {
  citability: 0.35,
  brand: 0.3,
  crawler: 0.25,
  llmstxt: 0.1,
} as const;

/** GEO-dashboard rollup: how likely AI assistants are to surface this site. */
export function computeAiVisibility(parts: {
  citability: number;
  brand: number;
  crawler: number;
  llmstxt: number;
}): number {
  return Math.round(
    parts.citability * AI_VISIBILITY_WEIGHTS.citability +
      parts.brand * AI_VISIBILITY_WEIGHTS.brand +
      parts.crawler * AI_VISIBILITY_WEIGHTS.crawler +
      parts.llmstxt * AI_VISIBILITY_WEIGHTS.llmstxt,
  );
}
