import { describe, expect, it } from "vitest";
import {
  getIntegrationProvider,
  integrationRequirements,
  validateIntegrationConfigInput,
  validateIntegrationSecretsInput,
} from "@/lib/integrations/providers";

describe("integration provider definitions", () => {
  it("defines required setup for available publishing providers", () => {
    const webhook = getIntegrationProvider("webhook");
    const wordpress = getIntegrationProvider("wordpress");
    const devto = getIntegrationProvider("devto");

    expect(webhook?.fields.map((field) => field.key)).toEqual(["webhookUrl"]);
    expect(webhook?.secrets.map((secret) => [secret.key, secret.required])).toEqual([
      ["webhook_bearer_token", false],
      ["webhook_signing_secret", false],
    ]);
    expect(wordpress?.fields.filter((field) => field.required).map((field) => field.key)).toEqual([
      "siteUrl",
      "username",
    ]);
    expect(devto?.secrets.filter((secret) => secret.required).map((secret) => secret.key)).toEqual([
      "devto_api_key",
    ]);
  });

  it("keeps OAuth-heavy providers gated instead of configurable", () => {
    for (const providerId of ["medium", "reddit", "x_post", "x_article", "linkedin_post", "linkedin_article"]) {
      const provider = getIntegrationProvider(providerId);

      expect(provider?.status).toBe("gated");
      expect(provider?.fields).toEqual([]);
      expect(provider?.secrets).toEqual([]);
      expect(integrationRequirements(provider!, {}, {}).met).toBe(false);
    }
  });

  it("validates config and secret keys from provider definitions", () => {
    expect(
      validateIntegrationConfigInput("webhook", {
        webhookUrl: "https://hooks.example.com/articles",
      }),
    ).toEqual({ webhookUrl: "https://hooks.example.com/articles" });
    expect(() => validateIntegrationConfigInput("webhook", { siteUrl: "https://example.com" }))
      .toThrow("Unsupported config field");
    expect(() => validateIntegrationConfigInput("webhook", { webhookUrl: "not-a-url" }))
      .toThrow("must be a valid URL");

    expect(
      validateIntegrationSecretsInput("wordpress", {
        wordpress_application_password: "app-password",
      }),
    ).toEqual({ wordpress_application_password: "app-password" });
    expect(() => validateIntegrationSecretsInput("wordpress", { api_key: "legacy" }))
      .toThrow("Unsupported secret field");
  });
});
