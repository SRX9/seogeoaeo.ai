import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND, loadBrand, toReportBrand } from "./brand-config";
import { buildProposal, recommendTier } from "./proposal";

describe("loadBrand", () => {
  it("deep-merges overrides over defaults without dropping unset keys", () => {
    const brand = loadBrand({ name: "Acme Agency", colors: { primary: "#123456" } });
    expect(brand.name).toBe("Acme Agency");
    expect(brand.colors.primary).toBe("#123456");
    expect(brand.colors.accent).toBe(DEFAULT_BRAND.colors.accent); // preserved
    expect(brand.contact.email).toBeNull();
  });

  it("returns defaults when no overrides are given, and adapts to report brand", () => {
    expect(loadBrand()).toEqual(DEFAULT_BRAND);
    expect(toReportBrand(loadBrand({ name: "X" }))).toMatchObject({ name: "X", primary: DEFAULT_BRAND.colors.primary });
  });
});

describe("proposal", () => {
  it("recommends a higher tier for a lower score (bigger opportunity)", () => {
    expect(recommendTier(40)).toBe("Authority");
    expect(recommendTier(65)).toBe("Growth");
    expect(recommendTier(85)).toBe("Starter");
  });

  it("builds three packages with exactly one recommended", () => {
    const proposal = buildProposal({ overall: 55 });
    expect(proposal.packages).toHaveLength(3);
    expect(proposal.packages.filter((p) => p.recommended)).toHaveLength(1);
    expect(proposal.recommendedTier).toBe("Growth");
    expect(proposal.roi).toContain("gap");
  });
});
