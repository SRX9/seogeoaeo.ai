import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm/client", () => ({
  getLlmConfig: vi.fn(),
  generateJson: vi.fn(),
}));
vi.mock("@/lib/research/serper", () => ({
  serperSearch: vi.fn(),
}));

import { generateJson, getLlmConfig } from "@/lib/llm/client";
import { discoverCompetitors, extractBrandDetails } from "@/lib/brand/enrich";
import { serperSearch, type SerperResult } from "@/lib/research/serper";

const mockGetLlmConfig = vi.mocked(getLlmConfig);
const mockGenerateJson = vi.mocked(generateJson);
const mockSerper = vi.mocked(serperSearch);

const llmConfig = {
  baseUrl: "https://llm.test",
  apiKey: "k",
  models: { light: "m-light", heavy: "m-heavy", image: "m-image" },
};

function serperResult(partial: Partial<SerperResult>): SerperResult {
  return { organic: [], peopleAlsoAsk: [], knowledgeGraph: null, ...partial };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonResult = (data: unknown) => ({ data }) as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractBrandDetails", () => {
  it("maps and clamps LLM output to the field maxima", async () => {
    mockGetLlmConfig.mockReturnValue(llmConfig);
    mockSerper.mockResolvedValue(
      serperResult({ organic: [{ title: "Acme", snippet: "Analytics for teams" }] }),
    );
    mockGenerateJson.mockResolvedValue(
      jsonResult({
        productDescription: "x".repeat(5000),
        audience: "developers",
        tone: "friendly, expert",
        seedKeywords: "seo, analytics",
      }),
    );

    const details = await extractBrandDetails({ name: "Acme", website: "https://acme.com" });

    expect(details.productDescription).toHaveLength(4000);
    expect(details.audience).toBe("developers");
    expect(details.tone).toBe("friendly, expert");
    expect(details.seedKeywords).toBe("seo, analytics");
  });

  it("returns empty fields and skips the LLM when it is not configured", async () => {
    mockGetLlmConfig.mockReturnValue(null);
    mockSerper.mockResolvedValue(serperResult({ organic: [{ title: "Acme", snippet: "data" }] }));

    const details = await extractBrandDetails({ name: "Acme", website: "https://acme.com" });

    expect(details).toEqual({ productDescription: "", audience: "", tone: "", seedKeywords: "" });
    expect(mockGenerateJson).not.toHaveBeenCalled();
  });

  it("returns empty fields and skips the LLM when search has no context", async () => {
    mockGetLlmConfig.mockReturnValue(llmConfig);
    mockSerper.mockResolvedValue(serperResult({}));

    const details = await extractBrandDetails({ name: "Acme", website: "" });

    expect(details.productDescription).toBe("");
    expect(mockGenerateJson).not.toHaveBeenCalled();
  });
});

describe("discoverCompetitors", () => {
  it("returns nothing when there is no remaining capacity", async () => {
    const result = await discoverCompetitors({ name: "Acme", website: "https://acme.com" }, 0);
    expect(result).toEqual([]);
    expect(mockSerper).not.toHaveBeenCalled();
  });

  it("fallback dedupes by domain, drops the brand's own site and aggregators, and caps", async () => {
    mockGetLlmConfig.mockReturnValue(null);
    mockSerper.mockResolvedValue(
      serperResult({
        organic: [
          { title: "Acme", link: "https://acme.com/home" },
          { title: "Rival", link: "https://rival.com" },
          { title: "Rival dup", link: "https://www.rival.com/pricing" },
          { title: "G2 listing", link: "https://www.g2.com/products/acme" },
          { title: "Foo", link: "https://foo.io" },
          { title: "Bar", link: "https://bar.dev" },
        ],
      }),
    );

    const result = await discoverCompetitors({ name: "Acme", website: "https://acme.com" }, 2);

    expect(result.map((c) => c.url)).toEqual(["https://rival.com", "https://foo.io"]);
  });

  it("LLM path normalizes URLs, excludes the brand domain, and dedupes", async () => {
    mockGetLlmConfig.mockReturnValue(llmConfig);
    mockSerper.mockResolvedValue(
      serperResult({ organic: [{ title: "Rival", link: "https://rival.com" }] }),
    );
    mockGenerateJson.mockResolvedValue(
      jsonResult({
        competitors: [
          { name: "Rival", url: "rival.com" },
          { name: "Rival again", url: "https://www.rival.com" },
          { name: "Self", url: "https://acme.com" },
          { name: "Other", url: "https://other.com" },
        ],
      }),
    );

    const result = await discoverCompetitors({ name: "Acme", website: "https://acme.com" }, 5);

    expect(result).toEqual([
      { name: "Rival", url: "https://rival.com" },
      { name: "Other", url: "https://other.com" },
    ]);
  });
});
