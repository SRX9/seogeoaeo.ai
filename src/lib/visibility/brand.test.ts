import { describe, expect, it } from "vitest";
import { collectSameAs, scanBrand } from "./brand";
import type { OffsiteSignals } from "./offsite";

function mockFetch(map: { wikipedia?: unknown; wikidata?: unknown }): typeof fetch {
  return (async (url: string) => {
    const body = url.includes("wikidata.org") ? map.wikidata : map.wikipedia;
    return new Response(JSON.stringify(body ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
}

const offsite = (over: Partial<OffsiteSignals> = {}): OffsiteSignals => ({
  reddit: { mentions: 40, recentMentions: 12, subreddits: 5, source: "api" },
  youtube: { officialChannel: true, videoMentions: 8 },
  web: { thirdPartyMentions: 7, knowledgeGraph: true, linkedinCompany: true },
  limitedData: false,
  ...over,
});

describe("scanBrand", () => {
  it("scores a brand with a Wikipedia page + real off-site presence highly", async () => {
    const r = await scanBrand("Acme", "acme.example", {
      sameAsUrls: ["https://www.g2.com/products/acme"],
      offsite: offsite(),
      fetchImpl: mockFetch({
        wikipedia: { query: { search: [{ title: "Acme Corporation" }, { title: "Other" }] } },
        wikidata: { search: [{ id: "Q42", description: "software company" }] },
      }),
    });
    expect(r.wikipedia.hasPage).toBe(true);
    expect(r.wikidata.id).toBe("Q42");
    expect(r.limitedData).toBe(false);
    // 30 (wiki) + 20 (reddit ≥10) + 15 (youtube channel) + 10 (linkedin) + 16 (industry: 6 sameAs + 10 web) = 91
    expect(r.score).toBe(91);
    const reddit = r.platforms.find((p) => p.platform === "Reddit")!;
    expect(reddit.evidence).toMatchObject({ recent: 12, source: "api" });
  });

  it("scores an unknown brand with no presence near zero", async () => {
    const r = await scanBrand("Zxqwerty", null, {
      sameAsUrls: [],
      offsite: offsite({ reddit: null, youtube: null, web: { thirdPartyMentions: 0, knowledgeGraph: false, linkedinCompany: false } }),
      fetchImpl: mockFetch({ wikipedia: { query: { search: [] } }, wikidata: { search: [] } }),
    });
    expect(r.wikipedia.hasPage).toBe(false);
    expect(r.score).toBe(0);
    expect(r.findings.some((f) => f.category === "brand_authority")).toBe(true);
  });

  it("awards partial credit for a Wikidata entry without a Wikipedia page", async () => {
    const r = await scanBrand("Acme", null, {
      offsite: offsite({ reddit: null, youtube: null, web: null, limitedData: true }),
      fetchImpl: mockFetch({
        wikipedia: { query: { search: [{ title: "Unrelated topic" }] } },
        wikidata: { search: [{ id: "Q1", description: "brand" }] },
      }),
    });
    expect(r.wikipedia.hasPage).toBe(false);
    expect(r.platforms[0].earned).toBe(15); // Wikidata-only partial credit
  });

  it("does NOT match a generic-name Wikipedia title (substring false-positive fixed)", async () => {
    const river = await scanBrand("Acme", null, {
      offsite: offsite({ limitedData: true, reddit: null, youtube: null, web: null }),
      fetchImpl: mockFetch({ wikipedia: { query: { search: [{ title: "Acme River" }] } }, wikidata: { search: [] } }),
    });
    expect(river.wikipedia.hasPage).toBe(false);

    const disambig = await scanBrand("Acme", null, {
      offsite: offsite({ limitedData: true, reddit: null, youtube: null, web: null }),
      fetchImpl: mockFetch({ wikipedia: { query: { search: [{ title: "Acme (company)" }] } }, wikidata: { search: [] } }),
    });
    expect(disambig.wikipedia.hasPage).toBe(true); // parenthetical disambiguation is stripped
  });

  it("degrades to declared-profile credit when off-site data is unavailable", async () => {
    const r = await scanBrand("Acme", "acme.example", {
      sameAsUrls: [
        "https://www.youtube.com/@acme",
        "https://www.reddit.com/r/acme",
        "https://www.linkedin.com/company/acme",
        "https://www.g2.com/products/acme",
      ],
      offsite: null, // caller passes null → limitedData, sameAs-only scoring
      fetchImpl: mockFetch({
        wikipedia: { query: { search: [{ title: "Acme Corporation" }] } },
        wikidata: { search: [] },
      }),
    });
    expect(r.limitedData).toBe(true);
    // 30 (wiki) + 6 (reddit declared) + 5 (youtube declared) + 10 (linkedin declared) + 6 (1 industry ×6) = 57
    expect(r.score).toBe(57);
    // limitedData suppresses the punitive low-authority finding.
    expect(r.findings.some((f) => f.category === "brand_authority")).toBe(false);
    expect(r.recommendations.some((rec) => rec.action.includes("declared profiles only"))).toBe(true);
  });

  it("is deterministic given identical injected signals", async () => {
    const args = () =>
      scanBrand("Acme", "acme.example", {
        sameAsUrls: ["https://www.g2.com/products/acme"],
        offsite: offsite(),
        fetchImpl: mockFetch({
          wikipedia: { query: { search: [{ title: "Acme Corporation" }] } },
          wikidata: { search: [{ id: "Q42", description: "x" }] },
        }),
      });
    expect((await args()).score).toBe((await args()).score);
  });
});

describe("collectSameAs", () => {
  it("deep-collects sameAs arrays from @graph nodes", () => {
    const sd = [{ "@graph": [{ "@type": "Organization", sameAs: ["https://x.com/a", "https://linkedin.com/company/a"] }] }];
    expect(collectSameAs(sd)).toEqual(["https://x.com/a", "https://linkedin.com/company/a"]);
  });
});
