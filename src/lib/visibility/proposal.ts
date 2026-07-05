import { scoreBand } from "./display";

/**
 * V7.4 — proposal generator (optional agency tier). Turns audit data into a
 * tiered proposal with packages, ROI projection, timeline, and a recommended
 * tier from the score. Logic from commands-reference.md "/geo proposal".
 */

export type Tier = "Starter" | "Growth" | "Authority";

export interface ProposalPackage {
  tier: Tier;
  price: number;
  deliverables: string[];
  recommended: boolean;
}

export interface Proposal {
  score: number;
  band: string;
  recommendedTier: Tier;
  packages: ProposalPackage[];
  roi: string;
  timeline: string;
}

/** Lower score = bigger opportunity = more work → higher tier recommended. */
export function recommendTier(score: number): Tier {
  if (score < 50) return "Authority";
  if (score < 75) return "Growth";
  return "Starter";
}

const BASE: Record<Tier, { price: number; deliverables: string[] }> = {
  Starter: {
    price: 1500,
    deliverables: ["Full visibility audit", "Quick-win fixes applied", "Monthly score report"],
  },
  Growth: {
    price: 3500,
    deliverables: [
      "Everything in Starter",
      "Schema + llms.txt implemented",
      "Answer-block optimization",
      "Competitor benchmark",
    ],
  },
  Authority: {
    price: 7500,
    deliverables: [
      "Everything in Growth",
      "Brand-entity & Wikipedia program",
      "Per-engine platform optimization",
      "Answer-share tracking + monthly strategy",
    ],
  },
};

export function buildProposal(audit: { overall: number | null; findingCount?: number }): Proposal {
  const score = audit.overall ?? 0;
  const recommended = recommendTier(score);
  const packages: ProposalPackage[] = (Object.keys(BASE) as Tier[]).map((tier) => ({
    tier,
    price: BASE[tier].price,
    deliverables: BASE[tier].deliverables,
    recommended: tier === recommended,
  }));

  // Conservative ROI framing tied to the score gap.
  const gap = Math.max(0, 80 - score);
  return {
    score,
    band: scoreBand(score),
    recommendedTier: recommended,
    packages,
    roi: `Closing your ${gap}-point visibility gap typically compounds into more AI citations and organic clicks over 3–6 months.`,
    timeline: recommended === "Authority" ? "6 months" : recommended === "Growth" ? "3 months" : "30 days",
  };
}
