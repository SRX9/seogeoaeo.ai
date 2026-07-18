import { describe, expect, it } from "vitest";
import {
  parseDirectedWritingTopic,
  resolveSteeringIntent,
} from "@/lib/agent/steer";
import { rankTopicsForAgentPriorities } from "@/lib/jobs/daily";
import {
  connectorCapabilities,
  connectorHasCapability,
} from "@/lib/integrations/capabilities";

describe("resolveSteeringIntent", () => {
  it.each([
    ["Focus on enterprise buyers this month", "priority"],
    ["Never publish competitor comparison pages", "constraint"],
    ["Pause publishing until Monday", "schedule"],
    ["Do not publish until Monday", "constraint"],
    ["You may update article metadata automatically", "permission"],
    ["You can publish until Monday", "permission"],
    ["Write about this product launch next", "direction"],
    ["Why are you doing this?", "explanation"],
    ["What changed this week?", "status"],
    ["You can publish and you must not publish", "ambiguous"],
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

  it("declares updates for providers whose adapters update existing posts", () => {
    expect(connectorHasCapability("devto", "article.update")).toBe(true);
    expect(connectorHasCapability("hashnode", "article.update")).toBe(true);
  });
});

describe("owner-directed writing", () => {
  it("extracts a usable topic only from supported article directions", () => {
    expect(parseDirectedWritingTopic("Write an article about enterprise SEO next")).toBe(
      "Enterprise SEO",
    );
    expect(parseDirectedWritingTopic("Publish the latest draft")).toBeNull();
  });

  it("moves owner-priority matches ahead of a higher-scored unrelated topic", () => {
    const ranked = rankTopicsForAgentPriorities(
      [
        { title: "Consumer SEO", score: 95 },
        { title: "Enterprise discovery", score: 70 },
      ],
      ["Focus on enterprise buyers this month"],
    );
    expect(ranked.map((topic) => topic.title)).toEqual([
      "Enterprise discovery",
      "Consumer SEO",
    ]);
  });
});
