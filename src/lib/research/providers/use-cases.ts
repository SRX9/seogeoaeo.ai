import type { ResearchContext, ResearchFinding, ResearchProvider } from "@/lib/research/types";

/**
 * C1 target-profile provider: expands the human-reviewed customer-profile
 * inventory into bottom-of-funnel article candidates. Deterministic: the LLM
 * judgement happened when the inventory was built; here we only enumerate the
 * article families each row earns. Buyers searching these are choosing a tool now.
 */

const MAX_ROWS = 8;
const MAX_COMPARISON_COMPETITORS = 3;

function bofu(
  title: string,
  thesis: string,
  evidence: string,
  keywords?: string,
): ResearchFinding {
  return {
    title,
    query: keywords,
    source: "Use-case inventory",
    sourceType: "use_case",
    evidenceUrls: [],
    snippet: evidence,
    intentTier: "bofu",
    thesis,
  };
}

export const useCaseProvider: ResearchProvider = {
  id: "use_cases",
  isAvailable() {
    return true;
  },
  async discover(context: ResearchContext) {
    const product = context.brand.name?.trim();
    const findings: ResearchFinding[] = [];

    for (const row of context.useCases.slice(0, MAX_ROWS)) {
      const audience = row.industry ? `${row.persona} (${row.industry})` : row.persona;
      const evidence = `Target profile: ${audience}: needs to ${row.job}`;

      findings.push(
        bofu(
          product ? `How to ${row.job} with ${product}` : `How to ${row.job}`,
          `${audience} trying to ${row.job} are choosing a tool right now.`,
          evidence,
          row.job,
        ),
        bofu(
          `Best way to ${row.job}`,
          `Question-intent query with an answer we own: the AEO play for this target profile.`,
          evidence,
          `best way to ${row.job}`,
        ),
      );
      if (product) {
        findings.push(
          bofu(
            `${product} for ${row.persona}`,
            `A dedicated page for ${row.persona} converts the readers every other article warms up.`,
            evidence,
            `${product} for ${row.persona}`,
          ),
        );
      }
    }

    // Comparison family: classic BOFU, the highest conversion intent we can
    // write for. Pair the brand against each competitor, angled at the
    // personas the inventory says actually buy.
    const personas = [...new Set(context.useCases.map((row) => row.persona))];
    for (const competitor of context.competitors.slice(0, MAX_COMPARISON_COMPETITORS)) {
      if (product) {
        findings.push(
          bofu(
            `${product} vs ${competitor.name}: an honest comparison`,
            `Someone comparing us with ${competitor.name} is picking a tool this week.`,
            `Competitor: ${competitor.name} (${competitor.url})`,
            `${product} vs ${competitor.name}`,
          ),
        );
      }
      if (personas[0]) {
        findings.push(
          bofu(
            `${competitor.name} alternatives for ${personas[0]}`,
            `People searching for "${competitor.name} alternative" are already comparing options. A focused page can put us in that comparison.`,
            `Competitor: ${competitor.name} (${competitor.url})`,
            `${competitor.name} alternative`,
          ),
        );
      }
    }

    return findings;
  },
};
