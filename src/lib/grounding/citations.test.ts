import { describe, expect, it } from "vitest";
import { extractMaterialClaims } from "./claims";
import { verifyCitations } from "./citations";
import { createEvidencePacket } from "./evidence";

async function verifyAdversarialPair(claimText: string, retrievedText: string) {
  const url = "https://research.example/evidence";
  const markdown = `${claimText} [Evidence source](${url})`;
  const evidence = await createEvidencePacket([
    {
      searchQuery: "adversarial proposition",
      sourceUrl: url,
      title: "Evidence source",
      supportingExcerpt: retrievedText,
      sourceContent: retrievedText,
      sourceType: "primary",
      retrievalStatus: "fetched_verified",
    },
  ]);
  const claims = extractMaterialClaims(markdown, { evidence, brandNames: ["Acme"] });
  const report = await verifyCitations({
    markdown,
    evidence,
    claims,
    fetchPage: async (requestedUrl) => ({
      requestedUrl,
      finalUrl: url,
      statusCode: 200,
      canonicalUrl: url,
      title: "Evidence source",
      textContent: retrievedText,
      errors: [],
    }),
  });
  return report;
}

describe("citation proposition verification", () => {
  it("fails closed on reversed entities, swapped metric values, and refuted quotes", async () => {
    const pairs = [
      ["Acme acquired Beta in 2025.", "Beta acquired Acme in 2025."],
      ["Acme licensed Beta in 2025.", "Beta licensed Acme in 2025."],
      [
        "Acme licensed Beta software for enterprise customers across regulated financial services markets worldwide in 2025.",
        "Beta licensed Acme software for enterprise customers across regulated financial services markets worldwide in 2025.",
      ],
      ["Revenue rose 10% while costs fell 20%.", "Revenue fell 20% while costs rose 10%."],
      ["Revenue rose 10% and costs rose 20%.", "Revenue rose 20% and costs rose 10%."],
      [
        'A customer said "Acme doubled conversions."',
        '"Acme doubled conversions." is false.',
      ],
      [
        'A customer said "Acme doubled conversions."',
        'A reviewer falsely claimed "Acme doubled conversions."',
      ],
    ] as const;

    for (const [claim, source] of pairs) {
      const report = await verifyAdversarialPair(claim, source);
      expect(report.passed, `${claim} <= ${source}`).toBe(false);
      expect(report.claims.some((entry) => entry.material && !entry.supported)).toBe(true);
    }

    const shortCustomerClaim = extractMaterialClaims("Northstar slashed churn overnight.");
    expect(shortCustomerClaim).toHaveLength(1);
    expect(shortCustomerClaim[0]?.claimType).toBe("brand_fact");
  });
});
