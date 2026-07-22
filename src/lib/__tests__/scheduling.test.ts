import { describe, expect, it } from "vitest";
import { articleStatusForAutonomy, getWeekStart } from "@/lib/workspace/settings";

describe("workspace settings", () => {
  it("returns Monday as week start in UTC", () => {
    const monday = getWeekStart(new Date("2026-06-15T12:00:00Z"));
    expect(monday).toBe("2026-06-15");

    const wednesday = getWeekStart(new Date("2026-06-17T12:00:00Z"));
    expect(wednesday).toBe("2026-06-15");
  });

  it("maps autonomy mode to article status", () => {
    expect(articleStatusForAutonomy("FULL_AUTO")).toBe("approved");
    expect(articleStatusForAutonomy("AUTO_PUBLISH_FAST")).toBe("approved");
    expect(articleStatusForAutonomy("REVIEW")).toBe("draft");
  });
});

describe("insufficient credits error", () => {
  it("has a stable error name and carries the amounts", async () => {
    const { InsufficientCreditsError } = await import("@/lib/usage/credits");
    const error = new InsufficientCreditsError(100, 40);
    expect(error.name).toBe("InsufficientCreditsError");
    expect(error.required).toBe(100);
    expect(error.available).toBe(40);
  });
});
