import { describe, expect, it } from "vitest";
import { buildCompareGrid, type CompetitorSummary } from "./competitors";

const you: CompetitorSummary = {
  label: "You",
  overall: 68,
  subScores: { citability: 70, brand: 40, eeat: 65, technical: 80, schema: 60, platform: 55 },
  platforms: { ChatGPT: 60, Perplexity: 50 },
  resolvedFindings: 0,
  totalFindings: 0,
  scorerVersion: 3,
  wikipedia: false,
};

const rival: CompetitorSummary = {
  label: "Rival",
  overall: 81,
  subScores: { citability: 75, brand: 70, eeat: 66, technical: 82, schema: 65, platform: 72 },
  platforms: { ChatGPT: 78, Perplexity: 60 },
  resolvedFindings: 0,
  totalFindings: 0,
  scorerVersion: 3,
  wikipedia: true,
};

describe("buildCompareGrid", () => {
  it("builds a you-vs-them grid with lead flags", () => {
    const grid = buildCompareGrid(you, [rival]);
    expect(grid.youLabel).toBe("You");
    expect(grid.competitorLabels).toEqual(["Rival"]);
    const overall = grid.rows.find((r) => r.metric === "Overall visibility")!;
    expect(overall.you).toBe(68);
    expect(overall.competitors).toEqual([81]);
    expect(overall.youLead).toBe(false);
    const wiki = grid.rows.find((r) => r.metric === "Wikipedia entity")!;
    expect(wiki.kind).toBe("flag");
    expect(wiki.you).toBe(false);
  });

  it("emits catch-up actions where a competitor materially leads", () => {
    const grid = buildCompareGrid(you, [rival]);
    expect(grid.catchUp.some((a) => a.includes("Overall visibility"))).toBe(true);
    expect(grid.catchUp.some((a) => a.includes("Wikipedia"))).toBe(true);
  });
});
