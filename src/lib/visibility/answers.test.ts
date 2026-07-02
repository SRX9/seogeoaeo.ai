import { describe, expect, it } from "vitest";
import { apexDomain, computeShare, detectCitation, detectMention, nameVariants } from "./answers";
import { suggestPrompts } from "./prompt-suggestions";

describe("apexDomain", () => {
  it("strips www + subdomains to the registrable apex", () => {
    expect(apexDomain("https://www.acme.example/path")).toBe("acme.example");
    expect(apexDomain("blog.acme.com")).toBe("acme.com");
    expect(apexDomain("acme.io")).toBe("acme.io");
  });
});

describe("mention & citation detection", () => {
  it("matches brand name variants on word boundaries, not substrings", () => {
    const vars = nameVariants("Acme AI");
    expect(detectMention("I recommend Acme AI for this.", vars)).toBe(true);
    expect(detectMention("Try acmeai today", vars)).toBe(true); // no-space variant
    expect(detectMention("The macmeat shop", vars)).toBe(false); // not a substring hit
  });

  it("matches citations by apex domain", () => {
    expect(detectCitation(["https://www.acme.example/pricing", "https://other.com"], "acme.example")).toBe(true);
    expect(detectCitation(["https://competitor.com/x"], "acme.example")).toBe(false);
  });
});

describe("computeShare", () => {
  it("computes appeared / cited / share per engine", () => {
    const share = computeShare([
      { engine: "chatgpt", brandMentioned: true, brandCited: true },
      { engine: "chatgpt", brandMentioned: false, brandCited: false },
      { engine: "perplexity", brandMentioned: true, brandCited: false },
    ]);
    const cg = share.find((s) => s.engine === "chatgpt")!;
    expect(cg).toMatchObject({ prompts: 2, appeared: 1, cited: 1, share: 50 });
    const px = share.find((s) => s.engine === "perplexity")!;
    expect(px).toMatchObject({ prompts: 1, appeared: 1, cited: 0, share: 100 });
    // engines with no runs are omitted
    expect(share.find((s) => s.engine === "gemini")).toBeUndefined();
  });
});

describe("suggestPrompts", () => {
  it("seeds category, use-case, competitor, and PAA prompts (deduped, capped)", () => {
    const prompts = suggestPrompts({
      name: "Acme",
      category: "CRM software",
      audience: "solo founders",
      useCases: ["track deals", "how to send invoices"],
      competitors: ["Rival"],
      paa: ["Is CRM software worth it?"],
    });
    expect(prompts).toContain("best CRM software for solo founders");
    expect(prompts).toContain("CRM software alternatives");
    expect(prompts).toContain("how do I track deals");
    expect(prompts).toContain("Rival vs Acme");
    expect(prompts).toContain("Is CRM software worth it?");
    expect(prompts.length).toBeLessThanOrEqual(10);
    expect(new Set(prompts).size).toBe(prompts.length); // deduped
  });
});
