import { describe, expect, it } from "vitest";
import { collectSameAs, scanBrand } from "./brand";

function mockFetch(map: { wikipedia?: unknown; wikidata?: unknown }): typeof fetch {
  return (async (url: string) => {
    const body = url.includes("wikidata.org") ? map.wikidata : map.wikipedia;
    return new Response(JSON.stringify(body ?? {}), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("scanBrand", () => {
  it("scores a well-known brand with a Wikipedia page + profiles highly", async () => {
    const r = await scanBrand("Acme", "acme.example", {
      sameAsUrls: [
        "https://www.youtube.com/@acme",
        "https://www.reddit.com/r/acme",
        "https://www.linkedin.com/company/acme",
        "https://www.g2.com/products/acme",
      ],
      fetchImpl: mockFetch({
        wikipedia: { query: { search: [{ title: "Acme Corporation" }, { title: "Other" }] } },
        wikidata: { search: [{ id: "Q42", description: "software company" }] },
      }),
    });
    expect(r.wikipedia.hasPage).toBe(true);
    expect(r.wikidata.id).toBe("Q42");
    // 30 (wiki) + 20 (reddit) + 15 (youtube) + 10 (linkedin) + 8 (1 industry) = 83
    expect(r.score).toBe(83);
  });

  it("scores an unknown brand with no profiles near zero", async () => {
    const r = await scanBrand("Zxqwerty", null, {
      sameAsUrls: [],
      fetchImpl: mockFetch({ wikipedia: { query: { search: [] } }, wikidata: { search: [] } }),
    });
    expect(r.wikipedia.hasPage).toBe(false);
    expect(r.score).toBe(0);
    expect(r.findings.some((f) => f.category === "brand_authority")).toBe(true);
  });

  it("awards partial credit for a Wikidata entry without a Wikipedia page", async () => {
    const r = await scanBrand("Acme", null, {
      fetchImpl: mockFetch({
        wikipedia: { query: { search: [{ title: "Unrelated topic" }] } },
        wikidata: { search: [{ id: "Q1", description: "brand" }] },
      }),
    });
    expect(r.wikipedia.hasPage).toBe(false);
    expect(r.platforms[0].earned).toBe(15); // Wikidata-only partial credit
  });
});

describe("collectSameAs", () => {
  it("deep-collects sameAs arrays from @graph nodes", () => {
    const sd = [{ "@graph": [{ "@type": "Organization", sameAs: ["https://x.com/a", "https://linkedin.com/company/a"] }] }];
    expect(collectSameAs(sd)).toEqual(["https://x.com/a", "https://linkedin.com/company/a"]);
  });
});
