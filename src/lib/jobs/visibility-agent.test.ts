import { describe, expect, it } from "vitest";
import {
  canAutoApply,
  defaultLevelFor,
  dispatchDecision,
  dueForReaudit,
} from "./visibility-agent";

describe("defaultLevelFor", () => {
  it("Autopilot auto-applies auto-capable categories, proposes the rest", () => {
    expect(defaultLevelFor("FULL_AUTO", "auto")).toBe(2);
    expect(defaultLevelFor("FULL_AUTO", "artifact")).toBe(1);
    expect(defaultLevelFor("FULL_AUTO", "guided")).toBe(1);
    expect(defaultLevelFor("FULL_AUTO", null)).toBe(1);
  });

  it("Copilot proposes everywhere", () => {
    expect(defaultLevelFor("REVIEW", "auto")).toBe(1);
    expect(defaultLevelFor("REVIEW", "artifact")).toBe(1);
    expect(defaultLevelFor("REVIEW", null)).toBe(1);
  });
});

describe("dispatchDecision", () => {
  const auto = { category: "schema", fixCapability: "auto" };
  const guided = { category: "brand_authority", fixCapability: "guided" };

  it("applies auto-capable findings on Autopilot", () => {
    expect(dispatchDecision(auto, "FULL_AUTO", {})).toBe("apply");
  });

  it("proposes auto-capable findings on Copilot", () => {
    expect(dispatchDecision(auto, "REVIEW", {})).toBe("propose");
  });

  it("per-category override beats the dial", () => {
    // Opt-down: Autopilot brand watches schema only.
    expect(dispatchDecision(auto, "FULL_AUTO", { schema: 0 })).toBe("queue");
    // Opt-up: Copilot brand lets schema auto-apply.
    expect(dispatchDecision(auto, "REVIEW", { schema: 2 })).toBe("apply");
  });

  it("Level 2 on a guided category proposes — never applies", () => {
    expect(dispatchDecision(guided, "FULL_AUTO", { brand_authority: 2 })).toBe("propose");
    expect(canAutoApply(2, "guided")).toBe(false);
  });

  it("Level 0 override queues even for auto findings", () => {
    expect(dispatchDecision(auto, "REVIEW", { schema: 0 })).toBe("queue");
  });
});

describe("dueForReaudit", () => {
  const now = new Date("2026-07-07T00:00:00Z");

  it("never due on the none cadence", () => {
    expect(dueForReaudit(new Date("2020-01-01"), "none", now)).toBe(false);
  });

  it("weekly cadence is due after 7 days", () => {
    expect(dueForReaudit(new Date("2026-06-29T00:00:00Z"), "weekly", now)).toBe(true);
    expect(dueForReaudit(new Date("2026-07-03T00:00:00Z"), "weekly", now)).toBe(false);
  });
});
