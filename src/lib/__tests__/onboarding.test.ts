import { describe, expect, it } from "vitest";
import { onboardingProgress } from "@/lib/onboarding/status";

describe("onboarding progress", () => {
  it("counts completed steps", () => {
    const progress = onboardingProgress([
      { id: "a", title: "A", description: "", href: "/", completed: true },
      { id: "b", title: "B", description: "", href: "/", completed: false },
    ]);

    expect(progress).toEqual({ completed: 1, total: 2 });
  });
});
