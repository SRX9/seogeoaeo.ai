import { describe, expect, it } from "vitest";
import { buildActionPlan } from "./action-plan";
import type { Finding } from "./types";

const f = (over: Partial<Finding>): Finding => ({
  pillar: "seo",
  category: "meta_tags",
  severity: "medium",
  title: "t",
  recommendation: "r",
  ...over,
});

describe("buildActionPlan", () => {
  it("routes mechanically-fixable findings to quick wins, highest severity first", () => {
    const plan = buildActionPlan([
      f({ severity: "medium", fix_capability: "artifact", title: "art" }),
      f({ severity: "critical", fix_capability: "auto", title: "auto" }),
      f({ severity: "high", fix_capability: "guided", title: "guided" }),
    ]);
    expect(plan.quickWins.map((q) => q.title)).toEqual(["auto", "art"]);
    // Guided finding is not a quick win — it becomes a weekly theme.
    expect(plan.themes.some((t) => t.findings.some((x) => x.title === "guided"))).toBe(true);
  });

  it("groups guided findings into up to 4 weekly themes by category", () => {
    const plan = buildActionPlan([
      f({ category: "security", severity: "critical", fix_capability: "guided" }),
      f({ category: "ssr", severity: "high", fix_capability: "guided" }),
      f({ category: "url_structure", severity: "low", fix_capability: "guided" }),
      f({ category: "core_web_vitals", severity: "medium", fix_capability: "guided" }),
      f({ category: "extra_a", severity: "low", fix_capability: "guided" }),
    ]);
    expect(plan.themes).toHaveLength(4);
    expect(plan.themes[0].week).toBe(1);
    // Best-severity category leads.
    expect(plan.themes[0].title).toBe("Security");
    // 5th category is merged into the final theme.
    expect(plan.themes[3].title).toBe("Additional fixes");
    expect(plan.themes.flatMap((t) => t.findings)).toHaveLength(5);
  });
});
