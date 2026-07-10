import { describe, expect, it } from "vitest";
import {
  authorizeAction,
  isActionBlockedByOwnerConstraint,
  isArticleGenerationBlockedByOwnerConstraint,
} from "@/lib/agent/policy";

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

  it("supports global and provider-scoped publishing prohibitions", () => {
    expect(
      isActionBlockedByOwnerConstraint(
        "Never publish anything",
        "article.create",
        "ghost:article:launch",
      ),
    ).toBe(true);
    expect(
      isActionBlockedByOwnerConstraint(
        "Do not publish to Dev.to",
        "article.create",
        "devto:article:launch",
      ),
    ).toBe(true);
    expect(
      isActionBlockedByOwnerConstraint(
        "Do not publish to Dev.to",
        "article.create",
        "ghost:article:launch",
      ),
    ).toBe(false);
  });

  it("separates drafting prohibitions from publish-only constraints", () => {
    expect(
      isArticleGenerationBlockedByOwnerConstraint(
        "Never write about gambling",
        "A guide to gambling affiliates",
      ),
    ).toBe(true);
    expect(
      isArticleGenerationBlockedByOwnerConstraint(
        "Never publish gambling content",
        "A guide to gambling affiliates",
      ),
    ).toBe(false);
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

  it("honors an explicit low-risk connector permission in Review mode", () => {
    expect(
      authorizeAction({
        mode: "REVIEW",
        capability: "article.update",
        availableCapabilities: ["article.update"],
        grantedCapabilities: ["article.update"],
        riskLevel: "low",
        resourceRef: "ghost:article:owned-123",
      }).decision,
    ).toBe("allow");
  });

  it("does not let a class permission bypass the broad-site approval boundary", () => {
    expect(
      authorizeAction({
        mode: "REVIEW",
        capability: "site.meta.update",
        availableCapabilities: ["site.meta.update"],
        grantedCapabilities: ["site.meta.update"],
        riskLevel: "low",
        resourceRef: "site:/",
      }).decision,
    ).toBe("require_approval");
  });
});
