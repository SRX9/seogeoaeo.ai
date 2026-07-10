import { describe, expect, it } from "vitest";
import { authorizeAction } from "@/lib/agent/policy";

describe("authorizeAction", () => {
  it("denies a live action when the connector does not declare it", () => {
    expect(
      authorizeAction({
        mode: "FULL_AUTO",
        capability: "site.meta.update",
        availableCapabilities: ["article.update"],
        riskLevel: "low",
        resourceRef: "site:/pricing",
      }).decision,
    ).toBe("deny");
  });

  it("never lets autonomy bypass an owner prohibition", () => {
    expect(
      authorizeAction({
        mode: "FULL_AUTO",
        capability: "article.update",
        availableCapabilities: ["article.update"],
        riskLevel: "low",
        resourceRef: "wordpress:article:pricing-comparison",
        ownerConstraints: ["Never publish pricing comparisons"],
      }).decision,
    ).toBe("deny");
  });

  it("allows low-risk owned-content updates only in Autopilot", () => {
    const request = {
      capability: "article.update" as const,
      availableCapabilities: ["article.update" as const],
      riskLevel: "low" as const,
      resourceRef: "ghost:article:owned-123",
    };
    expect(authorizeAction({ ...request, mode: "FULL_AUTO" }).decision).toBe("allow");
    expect(authorizeAction({ ...request, mode: "REVIEW" }).decision).toBe(
      "require_approval",
    );
  });

  it("keeps broad site changes owner-approved", () => {
    expect(
      authorizeAction({
        mode: "FULL_AUTO",
        capability: "site.schema.update",
        availableCapabilities: ["site.schema.update"],
        riskLevel: "low",
        resourceRef: "site:/",
      }).decision,
    ).toBe("require_approval");
  });
});
