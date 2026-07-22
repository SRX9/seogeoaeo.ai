import { describe, expect, it } from "vitest";
import { brandOnboardingSchema } from "@/lib/brand/schemas";
import { onboardingProgress } from "@/lib/onboarding/status";
import { firstOutcomeObjective } from "@/lib/onboarding/first-outcome";

describe("onboarding progress", () => {
  it("counts completed steps", () => {
    const progress = onboardingProgress([
      { id: "a", title: "A", description: "", href: "/", completed: true },
      { id: "b", title: "B", description: "", href: "/", completed: false },
    ]);

    expect(progress).toEqual({ completed: 1, total: 2 });
  });
});

describe("brandOnboardingSchema", () => {
  it("accepts structured integration config and secrets", () => {
    const parsed = brandOnboardingSchema.parse({
      name: "Acme",
      website: "https://example.com",
      integrationProvider: "wordpress",
      integrationConfig: {
        siteUrl: "https://blog.example.com",
        username: "editor",
      },
      integrationSecrets: {
        wordpress_application_password: "app-password",
      },
    });

    expect(parsed.integrationConfig).toEqual({
      siteUrl: "https://blog.example.com",
      username: "editor",
    });
    expect(parsed.integrationSecrets).toEqual({
      wordpress_application_password: "app-password",
    });
    expect("integrationApiKey" in parsed).toBe(false);
    expect(parsed.firstOutcome).toBe("discovery");
  });

  it("accepts a first outcome and turns it into Claudia's initial objective", () => {
    const parsed = brandOnboardingSchema.parse({
      name: "Acme",
      website: "https://example.com",
      firstOutcome: "ai_answers",
    });

    expect(firstOutcomeObjective(parsed.firstOutcome, parsed.name)).toBe(
      "Increase trusted mentions and citations for Acme in relevant AI answers.",
    );
  });

  it("accepts an explicitly acknowledged fast auto-publish selection", () => {
    const parsed = brandOnboardingSchema.parse({
      name: "Acme",
      website: "https://example.com",
      autonomyMode: "AUTO_PUBLISH_FAST",
      fastAutoPublishAcknowledged: true,
    });

    expect(parsed.autonomyMode).toBe("AUTO_PUBLISH_FAST");
    expect(parsed.fastAutoPublishAcknowledged).toBe(true);
  });
});
