import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH, PUT } from "@/app/api/integrations/route";
import { requireApiBrand } from "@/lib/api/server";
import {
  clearIntegration,
  listIntegrations,
  saveIntegrationSecret,
  setIntegrationEnabled,
  updateIntegrationConfig,
} from "@/lib/integrations/repository";

vi.mock("@/lib/api/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/server")>();
  return {
    ...actual,
    requireApiBrand: vi.fn(),
  };
});

vi.mock("@/lib/integrations/repository", () => ({
  clearIntegration: vi.fn(),
  listIntegrations: vi.fn(),
  saveIntegrationSecret: vi.fn(),
  setIntegrationEnabled: vi.fn(),
  updateIntegrationConfig: vi.fn(),
}));

const scope = { workspaceId: "ws-1", brandId: "brand-1" };

function jsonRequest(body: unknown) {
  return new Request("https://app.test/api/integrations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiBrand).mockResolvedValue({
      scope,
      brand: { id: "brand-1" },
    } as Awaited<ReturnType<typeof requireApiBrand>>);
  });

  it("saves provider config and multiple provider-specific secrets", async () => {
    const response = await PUT(
      jsonRequest({
        provider: "webhook",
        config: { webhookUrl: "https://hooks.example.com/articles" },
        secrets: {
          webhook_bearer_token: "bearer",
          webhook_signing_secret: "signing",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(updateIntegrationConfig).toHaveBeenCalledWith(scope, "webhook", {
      webhookUrl: "https://hooks.example.com/articles",
    });
    expect(saveIntegrationSecret).toHaveBeenCalledWith(
      scope,
      "webhook",
      "webhook_bearer_token",
      "bearer",
    );
    expect(saveIntegrationSecret).toHaveBeenCalledWith(
      scope,
      "webhook",
      "webhook_signing_secret",
      "signing",
    );
  });

  it("accepts legacy api_key secret writes under the provider-specific key", async () => {
    const response = await PUT(
      jsonRequest({
        provider: "devto",
        secrets: {
          api_key: "legacy-devto-key",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(saveIntegrationSecret).toHaveBeenCalledWith(
      scope,
      "devto",
      "devto_api_key",
      "legacy-devto-key",
    );
  });

  it("blocks enabling when provider requirements are not met", async () => {
    vi.mocked(listIntegrations).mockResolvedValue([
      { provider: "reddit", requirementsMet: false },
    ] as Awaited<ReturnType<typeof listIntegrations>>);

    const response = await PATCH(jsonRequest({ provider: "reddit", enabled: true }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Complete required setup");
    expect(setIntegrationEnabled).not.toHaveBeenCalled();
  });

  it("enables providers only after requirements are met", async () => {
    vi.mocked(listIntegrations).mockResolvedValue([
      { provider: "devto", requirementsMet: true },
    ] as Awaited<ReturnType<typeof listIntegrations>>);

    const response = await PATCH(jsonRequest({ provider: "devto", enabled: true }));

    expect(response.status).toBe(200);
    expect(setIntegrationEnabled).toHaveBeenCalledWith(scope, "devto", true);
  });

  it("clears an integration config and encrypted secrets", async () => {
    const response = await DELETE(jsonRequest({ provider: "ghost" }));

    expect(response.status).toBe(200);
    expect(clearIntegration).toHaveBeenCalledWith(scope, "ghost");
  });

  it("clears an integration from the query string when the DELETE body is absent", async () => {
    const response = await DELETE(
      new Request("https://app.test/api/integrations?provider=wordpress", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    expect(clearIntegration).toHaveBeenCalledWith(scope, "wordpress");
  });
});
