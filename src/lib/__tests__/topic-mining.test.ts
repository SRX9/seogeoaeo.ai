import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { coversTopic } from "@/lib/research/providers/competitor-content";
import { useCaseProvider } from "@/lib/research/providers/use-cases";
import { scoreFindings } from "@/lib/research/score";
import type { ResearchContext, ResearchFinding } from "@/lib/research/types";

function makeContext(overrides: Partial<ResearchContext> = {}): ResearchContext {
  return {
    brand: {
      name: "InvoiceBot",
      productDescription: "Automated invoicing for freelancers",
      seedKeywords: "invoicing",
    },
    competitors: [{ name: "FreshBooks", url: "https://freshbooks.com" }],
    seedQueries: [],
    useCases: [
      { job: "send automatic invoice reminders", persona: "freelance designers" },
      { job: "track billable hours", persona: "agencies", industry: "creative services" },
    ],
    ourTitles: [],
    ...overrides,
  };
}

describe("use-case provider", () => {
  it("expands inventory rows into BOFU candidates with theses", async () => {
    const findings = await useCaseProvider.discover(makeContext());
    const titles = findings.map((finding) => finding.title);

    expect(titles).toContain("How to send automatic invoice reminders with InvoiceBot");
    expect(titles).toContain("Best way to send automatic invoice reminders");
    expect(titles).toContain("InvoiceBot for freelance designers");
    expect(titles).toContain("InvoiceBot vs FreshBooks: an honest comparison");
    expect(titles).toContain("FreshBooks alternatives for freelance designers");

    for (const finding of findings) {
      expect(finding.intentTier).toBe("bofu");
      expect(finding.sourceType).toBe("use_case");
      expect(finding.thesis).toBeTruthy();
    }
  });

  it("emits no comparison titles without a brand name and no rows without inventory", async () => {
    const anonymous = await useCaseProvider.discover(
      makeContext({ brand: { productDescription: "x" } }),
    );
    expect(anonymous.every((finding) => !finding.title.includes("vs"))).toBe(true);

    const empty = await useCaseProvider.discover(makeContext({ useCases: [], competitors: [] }));
    expect(empty).toEqual([]);
  });
});

describe("competitor gap coverage", () => {
  it("counts a topic covered when our titles share most head terms", () => {
    expect(coversTopic(["How to handle invoicing for agencies"], "invoicing for agencies")).toBe(
      true,
    );
    expect(coversTopic(["SEO tips for freelancers"], "invoicing for agencies")).toBe(false);
    expect(coversTopic([], "invoicing for agencies")).toBe(false);
  });
});

describe("unified backlog scoring (heuristic path)", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    // Force the deterministic heuristic path — no LLM config in unit tests.
    delete process.env.LLM_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function finding(overrides: Partial<ResearchFinding>): ResearchFinding {
    return {
      title: "t",
      source: "s",
      sourceType: "web_search",
      evidenceUrls: [],
      ...overrides,
    };
  }

  it("ranks intent tier ahead of raw score", async () => {
    const { topics } = await scoreFindings(
      [
        finding({
          title: "Trending topic with everything going for it",
          sourceType: "trend_query",
          query: "why is this trending?",
          evidenceUrls: ["https://example.com"],
        }),
        finding({
          title: "InvoiceBot vs FreshBooks",
          sourceType: "use_case",
          intentTier: "bofu",
          thesis: "Someone comparing us is picking a tool this week.",
        }),
      ],
      makeContext(),
    );

    expect(topics[0].title).toBe("InvoiceBot vs FreshBooks");
    expect(topics[0].intentTier).toBe("bofu");
    expect(topics[0].thesis).toContain("picking a tool");
  });

  it("boosts an idea confirmed by two independent sources and merges the duplicate", async () => {
    const single = await scoreFindings(
      [finding({ title: "Invoice reminders guide", sourceType: "keyword_api" })],
      makeContext(),
    );
    const confirmed = await scoreFindings(
      [
        finding({ title: "Invoice reminders guide", sourceType: "keyword_api" }),
        finding({ title: "Invoice Reminders Guide", sourceType: "web_search" }),
      ],
      makeContext(),
    );

    expect(confirmed.topics).toHaveLength(1);
    expect(confirmed.topics[0].score).toBeGreaterThan(single.topics[0].score);
  });
});
