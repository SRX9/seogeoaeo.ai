import { describe, expect, it } from "vitest";
import { resolveSteeringIntent } from "@/lib/agent/steer";
import {
  connectorCapabilities,
  connectorHasCapability,
} from "@/lib/integrations/capabilities";

describe("resolveSteeringIntent", () => {
  it.each([
    ["Focus on enterprise buyers this month", "priority"],
    ["Never publish competitor comparison pages", "constraint"],
    ["Pause publishing until Monday", "schedule"],
    ["You may update article metadata automatically", "permission"],
    ["Write about this product launch next", "direction"],
    ["Why are you doing this?", "explanation"],
    ["What changed this week?", "status"],
    ["Tell me a joke", "unsupported"],
  ] as const)("maps %s to %s", (message, intent) => {
    expect(resolveSteeringIntent(message)).toBe(intent);
  });
});

describe("connector capability discovery", () => {
  it("exposes owned-article update capability for WordPress and Ghost", () => {
    expect(connectorCapabilities("wordpress")).toContain("article.meta.update");
    expect(connectorCapabilities("ghost")).toContain("article.update");
  });

  it("does not claim broad site or rollback control", () => {
    expect(connectorHasCapability("wordpress", "site.meta.update")).toBe(false);
    expect(connectorHasCapability("ghost", "rollback.supported")).toBe(false);
  });
});
