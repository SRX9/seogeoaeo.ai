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

  it("defines the first five new connectors as configurable publishing destinations", () => {
    const expected = {
      qiita: { fields: [], secrets: ["qiita_access_token"] },
      beehiiv: {
        fields: ["publicationId"],
        secrets: ["beehiiv_api_key"],
      },
      writeas: {
        fields: ["collectionAlias"],
        secrets: ["writeas_access_token"],
      },
      paragraph: { fields: ["siteUrl"], secrets: ["paragraph_api_key"] },
      buttondown: { fields: [], secrets: ["buttondown_api_key"] },
    };

    for (const [providerId, setup] of Object.entries(expected)) {
      const provider = getIntegrationProvider(providerId);
      expect(provider?.status).toBe("available");
      expect(provider?.publishMode).toBe("article");
      expect(provider?.fields.map((field) => field.key)).toEqual(setup.fields);
      expect(provider?.secrets.map((secret) => secret.key)).toEqual(setup.secrets);
    }
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
      validateIntegrationConfigInput("beehiiv", { publicationId: "pub_abc123-def" }),
    ).toEqual({ publicationId: "pub_abc123-def" });
    expect(() =>
      validateIntegrationConfigInput("beehiiv", { publicationId: "publication-123" }),
    ).toThrow("must start with pub_");
    expect(
      validateIntegrationConfigInput("writeas", { collectionAlias: "my-blog-2" }),
    ).toEqual({ collectionAlias: "my-blog-2" });
    expect(() =>
      validateIntegrationConfigInput("writeas", { collectionAlias: "my blog" }),
    ).toThrow("only letters, numbers, and hyphens");

    expect(
      validateIntegrationSecretsInput("wordpress", {
        wordpress_application_password: "app-password",
      }),
    ).toEqual({ wordpress_application_password: "app-password" });
    expect(
      validateIntegrationSecretsInput("wordpress", {
        api_key: "legacy-app-password",
      }),
    ).toEqual({ wordpress_application_password: "legacy-app-password" });
    expect(() => validateIntegrationSecretsInput("wordpress", { ghost_admin_api_key: "wrong" }))
      .toThrow("Unsupported secret field");
  });
});
