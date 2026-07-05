import { describe, expect, it } from "vitest";
import { type ReportModel, toMarkdown } from "./report";
import { reportHtml } from "./report-pdf";

const model: ReportModel = {
  site: "https://acme.example",
  businessType: "saas",
  generatedAt: "2026-07-02T00:00:00.000Z",
  overall: 68,
  band: "Fair",
  aiVisibility: 55,
  subScores: [
    { key: "citability", label: "Quotable answers", score: 70 },
    { key: "brand", label: "Brand authority", score: 40 },
    { key: "eeat", label: "Trust signals", score: 65 },
    { key: "technical", label: "Site health", score: 80 },
    { key: "schema", label: "Structured data", score: 60 },
    { key: "platform", label: "AI engine readiness", score: 55 },
  ],
  platforms: [{ platform: "ChatGPT", score: 60 }],
  brand: [{ platform: "Wikipedia", status: "absent", score: 0 }],
  findingsByPillar: {
    seo: [{ pillar: "seo", category: "ssr", severity: "high", title: "SSR issue", recommendation: "Fix SSR" }],
    aeo: [],
    geo: [],
  },
  severityCounts: { critical: 0, high: 1, medium: 0, low: 0 },
  quickWins: [{ pillar: "seo", category: "meta_tags", severity: "medium", title: "Add title", recommendation: "Write one", fix_capability: "artifact" }],
  themes: [{ week: 1, title: "Ssr", findings: [{ pillar: "seo", category: "ssr", severity: "high", title: "SSR issue", recommendation: "Fix SSR" }] }],
  impact: "Solid foundation with clear upside.",
};

describe("toMarkdown", () => {
  it("renders all 12 sections and the overall score", () => {
    const md = toMarkdown(model);
    for (let i = 1; i <= 12; i++) expect(md).toContain(`## ${i}.`);
    expect(md).toContain("68/100 (Fair)");
    expect(md).toContain("Quotable answers");
    expect(md).toContain("Add title"); // quick win
  });
});

describe("reportHtml", () => {
  it("embeds the score, site, and a gauge color", () => {
    const html = reportHtml(model, { name: "Acme Report" });
    expect(html).toContain("Acme Report");
    expect(html).toContain("acme.example");
    expect(html).toContain(">68<"); // gauge value
    expect(html).toContain("#2563eb"); // 60–79 → blue gauge
  });
});
