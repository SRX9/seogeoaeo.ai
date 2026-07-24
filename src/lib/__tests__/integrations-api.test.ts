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
import { logError, logInfo, logWarn } from "@/lib/logging/logger";

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

vi.mock("@/lib/logging/logger", () => ({
  errorFields: (error: unknown, key = "error") => ({
    [`${key}_name`]: error instanceof Error ? error.name : "UnknownError",
    [`${key}_message`]: error instanceof Error ? error.message : String(error),
  }),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
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
    expect(logInfo).toHaveBeenCalledWith(
      "integration.configuration_saved",
      expect.objectContaining({
        provider: "webhook",
        config_field_count: 1,
        secret_field_count: 2,
      }),
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
    expect(logWarn).toHaveBeenCalledWith(
      "integration.configuration_rejected",
      expect.objectContaining({
        provider: "reddit",
        operation: "enable",
        reason_code: "requirements_unmet",
      }),
    );
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

  it("logs validation failures without logging submitted credential values", async () => {
    const response = await PUT(
      jsonRequest({
        provider: "qiita",
        secrets: { qiita_access_token: { invalid: "secret-value" } },
      }),
    );

    expect(response.status).toBe(400);
    expect(logWarn).toHaveBeenCalledWith(
      "integration.configuration_rejected",
      expect.objectContaining({
        provider: "qiita",
        reason_code: "invalid_secrets",
      }),
    );
    expect(JSON.stringify(vi.mocked(logWarn).mock.calls)).not.toContain("secret-value");
  });

  it("logs repository failures with connector context but no submitted secrets", async () => {
    vi.mocked(saveIntegrationSecret).mockRejectedValueOnce(
      new Error("encrypted credential write failed"),
    );

    const response = await PUT(
      jsonRequest({
        provider: "qiita",
        secrets: { qiita_access_token: "private-qiita-token" },
      }),
    );

    expect(response.status).toBe(500);
    expect(logError).toHaveBeenCalledWith(
      "integration.configuration_failed",
      expect.objectContaining({
        workspaceId: "ws-1",
        brandId: "brand-1",
        provider: "qiita",
        operation: "save",
        secret_field_count: 1,
      }),
    );
    expect(JSON.stringify(vi.mocked(logError).mock.calls)).not.toContain(
      "private-qiita-token",
    );
  });
});
