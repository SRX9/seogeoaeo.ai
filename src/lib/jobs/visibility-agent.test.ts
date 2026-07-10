import { describe, expect, it } from "vitest";
import {
  canAutoApply,
  canLiveApply,
  defaultLevelFor,
  dispatchDecision,
  dueForReaudit,
} from "./visibility-agent";
import {
  displayAutonomyLevel,
  isInstallReady,
  isLiveApplyAvailable,
  selectableAutonomyLevels,
} from "@/lib/visibility/fix-policy";

describe("defaultLevelFor", () => {
  it("defaults both modes to Prepare while live apply is unavailable", () => {
    expect(defaultLevelFor("FULL_AUTO", "auto")).toBe(1);
    expect(defaultLevelFor("FULL_AUTO", "artifact")).toBe(1);
    expect(defaultLevelFor("FULL_AUTO", "guided")).toBe(1);
    expect(defaultLevelFor("FULL_AUTO", null)).toBe(1);
    expect(defaultLevelFor("REVIEW", "auto")).toBe(1);
    expect(defaultLevelFor("REVIEW", "artifact")).toBe(1);
    expect(defaultLevelFor("REVIEW", null)).toBe(1);
  });
});

describe("canLiveApply", () => {
  it("is false until a real host/CMS apply channel exists", () => {
    expect(canLiveApply("auto")).toBe(false);
    expect(canLiveApply("artifact")).toBe(false);
    expect(canLiveApply(null)).toBe(false);
    expect(isLiveApplyAvailable()).toBe(false);
  });
});

describe("dispatchDecision", () => {
  const auto = { category: "schema", fixCapability: "auto" };
  const guided = { category: "brand_authority", fixCapability: "guided" };

  it("prepares auto-capable findings when live apply is unavailable", () => {
    expect(dispatchDecision(auto, "FULL_AUTO", {})).toBe("propose");
    expect(canAutoApply(2, "auto")).toBe(false);
  });

  it("proposes on Copilot", () => {
    expect(dispatchDecision(auto, "REVIEW", {})).toBe("propose");
  });

  it("per-category override beats the dial", () => {
    expect(dispatchDecision(auto, "FULL_AUTO", { schema: 0 })).toBe("queue");
    // Opt-up Level 2 still proposes without a live channel.
    expect(dispatchDecision(auto, "REVIEW", { schema: 2 })).toBe("propose");
  });

  it("Level 2 on a guided category proposes — never applies", () => {
    expect(dispatchDecision(guided, "FULL_AUTO", { brand_authority: 2 })).toBe("propose");
    expect(canAutoApply(2, "guided")).toBe(false);
  });

  it("Level 0 queues", () => {
    expect(dispatchDecision(auto, "REVIEW", { schema: 0 })).toBe("queue");
  });
});

describe("isInstallReady", () => {
  it("treats auto and artifact as ready-to-install", () => {
    expect(isInstallReady("auto")).toBe(true);
    expect(isInstallReady("artifact")).toBe(true);
    expect(isInstallReady("guided")).toBe(false);
    expect(isInstallReady(null)).toBe(false);
  });
});

describe("selectableAutonomyLevels", () => {
  it("hides Level 2 while no live-apply channel exists", () => {
    expect(selectableAutonomyLevels()).toEqual([0, 1]);
    expect(displayAutonomyLevel(2)).toBe(1);
    expect(displayAutonomyLevel(1)).toBe(1);
    expect(displayAutonomyLevel(0)).toBe(0);
  });
});

describe("dueForReaudit", () => {
  it("respects cadence", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(dueForReaudit(null, "weekly", now)).toBe(true);
    expect(dueForReaudit(new Date("2026-05-30T00:00:00Z"), "weekly", now)).toBe(false);
    expect(dueForReaudit(new Date("2026-05-20T00:00:00Z"), "weekly", now)).toBe(true);
    expect(dueForReaudit(new Date(), "none", now)).toBe(false);
  });
});
