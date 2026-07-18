export const FIRST_OUTCOME_IDS = [
  "discovery",
  "consistent_content",
  "priority_keywords",
  "ai_answers",
  "website_health",
] as const;

export type FirstOutcomeId = (typeof FIRST_OUTCOME_IDS)[number];

export const DEFAULT_FIRST_OUTCOME: FirstOutcomeId = "discovery";

export function firstOutcomeObjective(outcome: FirstOutcomeId, brandName: string) {
  const objectives: Record<FirstOutcomeId, string> = {
    discovery: `Grow qualified discovery and trusted visibility for ${brandName}.`,
    consistent_content: `Publish useful, grounded content consistently for ${brandName}.`,
    priority_keywords: `Improve qualified search discovery for ${brandName}'s priority queries.`,
    ai_answers: `Increase trusted mentions and citations for ${brandName} in relevant AI answers.`,
    website_health: `Improve ${brandName}'s website search health and resolve important discovery issues.`,
  };

  return objectives[outcome];
}
