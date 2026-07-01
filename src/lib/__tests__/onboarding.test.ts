import { describe, expect, it } from "vitest";
import { brandOnboardingSchema } from "@/lib/brand/schemas";
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
  });
});
