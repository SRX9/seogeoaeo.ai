import { describe, expect, it } from "vitest";
import { renderBadge } from "@/lib/growth/badge";
import { buildDigest, canAutoApply, dueForReaudit } from "@/lib/jobs/visibility-agent";
import type { DeltaReport } from "./compare";
import { median } from "./baseline";
import { dedupeFindings, type OpenFinding } from "./findings-repository";
import { getTool, TOOLBOX } from "./toolbox-registry";

describe("median (industry baseline)", () => {
  it("computes the median, rounding the even-length midpoint", () => {
    expect(median([70])).toBe(70);
    expect(median([60, 80])).toBe(70);
    expect(median([10, 20, 90])).toBe(20);
    expect(median([])).toBeNull();
  });
});

describe("dedupeFindings", () => {
  const f = (over: Partial<OpenFinding>): OpenFinding => ({
    id: Math.random().toString(),
    auditId: "a",
    pillar: "seo",
    category: "meta_tags",
    severity: "medium",
    title: "Missing title",
    recommendation: "r",
    fixCapability: "artifact",
    fixPayload: null,
    createdAt: new Date(),
    ...over,
  });

  it("collapses the same issue found by an audit and a Toolbox run into one row", () => {
    const deduped = dedupeFindings([
      f({ auditId: "audit-1", severity: "medium" }),
      f({ auditId: undefined, severity: "high" }), // same category+title from a tool run
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].severity).toBe("high"); // keeps the more severe
  });
});

describe("toolbox registry", () => {
  it("exposes the 8 launch tools with valid metadata", () => {
    expect(TOOLBOX).toHaveLength(8);
    for (const t of TOOLBOX) {
      expect(t.slug).toMatch(/^[a-z-]+$/);
      expect(["tool_run_basic", "tool_run_ai"]).toContain(t.costKey);
      expect(typeof t.run).toBe("function");
    }
    expect(getTool("citability")).toBeDefined();
    expect(getTool("nope")).toBeUndefined();
  });

  it("runs the citability tool on plain text without a network call", async () => {
    const r = await getTool("citability")!.run(
      "Content marketing is a strategy. According to Gartner, 60% of teams use it. In 2024 our research found a 30% lift across five hundred companies we analyzed for the study.",
    );
    expect(typeof r.score).toBe("number");
  });
});

describe("visibility agent cadence + digest", () => {
  it("gates re-audits by plan cadence", () => {
    const now = new Date("2026-07-02");
    expect(dueForReaudit(null, "monthly", now)).toBe(true);
    expect(dueForReaudit(new Date("2026-06-01"), "monthly", now)).toBe(true);
    expect(dueForReaudit(new Date("2026-06-28"), "monthly", now)).toBe(false);
    expect(dueForReaudit(new Date("2026-01-01"), "none", now)).toBe(false);
  });

  it("only auto-applies auto-capable categories at Level 2", () => {
    expect(canAutoApply(2, "auto")).toBe(true);
    expect(canAutoApply(2, "artifact")).toBe(false);
    expect(canAutoApply(1, "auto")).toBe(false);
  });

  it("builds a proof-stack-ordered digest in Claudia's voice", () => {
    const delta = {
      overall: { key: "overall", label: "Overall", baseline: 61, current: 68, delta: 7, trend: "▲" },
    } as DeltaReport;
    const digest = buildDigest({
      siteUrl: "acme.example",
      delta,
      answerShare: [{ engine: "perplexity", prompts: 10, appeared: 4, cited: 2, share: 40 }],
      fixesApplied: 3,
      clicksDeltaPct: 9,
    });
    expect(digest).toContain("61 → 68");
    expect(digest).toContain("4 of 10");
    expect(digest).toContain("Clicks +9%");
    expect(digest).toContain("Claudia fixed 3");
  });
});

describe("badge", () => {
  it("renders an SVG with the score and a band color", () => {
    const svg = renderBadge("acme.example", 82);
    expect(svg).toContain("<svg");
    expect(svg).toContain("82");
    expect(svg).toContain("#16a34a"); // 80+ → green
    expect(svg).toContain("acme.example");
  });
});
