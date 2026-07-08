import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/brands/route";
import { getApiContext } from "@/lib/api/server";
import { setActiveBrandCookie } from "@/lib/brand/context";
import {
  BrandExistsError,
  createBrand,
  createCompetitors,
  getBrandByName,
  listCompetitors,
  upsertBrandProfile,
} from "@/lib/brand/repository";
import { createUseCase, listUseCases } from "@/lib/brand/use-cases";
import { getStripe } from "@/lib/billing/stripe";
import { startSetupRun, triggerSetupRun } from "@/lib/jobs/setup-run";

vi.mock("@/lib/api/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/server")>();
  return {
    ...actual,
    getApiContext: vi.fn(),
  };
});

vi.mock("@/lib/brand/context", () => ({
  setActiveBrandCookie: vi.fn(),
}));

vi.mock("@/lib/brand/repository", () => {
  class MockBrandExistsError extends Error {
    constructor(name: string) {
      super(`A brand named "${name}" already exists in this workspace.`);
      this.name = "BrandExistsError";
    }
  }

  return {
    BrandExistsError: MockBrandExistsError,
    createBrand: vi.fn(),
    createCompetitors: vi.fn(),
    getBrandByName: vi.fn(),
    listBrands: vi.fn(),
    listCompetitors: vi.fn(),
    upsertBrandProfile: vi.fn(),
  };
});

vi.mock("@/lib/brand/use-cases", () => ({
  createUseCase: vi.fn(),
  listUseCases: vi.fn(),
}));

vi.mock("@/lib/integrations/repository", () => ({
  saveIntegrationSecret: vi.fn(),
  setIntegrationEnabled: vi.fn(),
  updateIntegrationConfig: vi.fn(),
}));

vi.mock("@/lib/billing/stripe", () => ({
  getStripe: vi.fn(),
}));

vi.mock("@/lib/jobs/setup-run", () => ({
  isSetupRunStale: vi.fn(() => false),
  startSetupRun: vi.fn(),
  triggerSetupRun: vi.fn(),
}));

const workspaceId = "ws-1";
const brand = {
  id: "brand-1",
  workspaceId,
  name: "Acme",
  autonomyMode: "FULL_AUTO",
  badgePublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const scope = { workspaceId, brandId: brand.id };
const setupRun = {
  id: "setup-1",
  status: "running",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function jsonRequest(body: unknown) {
  return new Request("https://app.test/api/brands", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function onboardingBody(extra: Record<string, unknown> = {}) {
  return {
    name: "Acme",
    website: "https://acme.test",
    productDescription: "Analytics for growing teams.",
    audience: "Founders",
    tone: "Clear",
    seedKeywords: "analytics",
    competitors: [{ name: "Rival", url: "https://rival.test" }],
    useCases: [{ job: "Track acquisition", persona: "Founders", industry: "SaaS" }],
    integrationProvider: "",
    integrationConfig: {},
    integrationSecrets: {},
    autonomyMode: "FULL_AUTO",
    ...extra,
  };
}

const checkoutSessionId = "cs_test_resume";

function mockCompletedCheckoutSession() {
  vi.mocked(getStripe).mockReturnValue({
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({
          id: checkoutSessionId,
          status: "complete",
          created: Math.floor(brand.createdAt.getTime() / 1000) - 60,
          metadata: { workspaceId, userId: "user-1" },
        }),
      },
    },
  } as unknown as ReturnType<typeof getStripe>);
}

describe("/api/brands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApiContext).mockResolvedValue({
      session: { user: { id: "user-1", email: "owner@acme.test", name: "Owner" } },
      workspace: { id: workspaceId, ownerId: "user-1", name: "Acme Workspace" },
      subscription: { status: "active", planId: "startup" },
      brands: [],
      brand: null,
    } as unknown as Awaited<ReturnType<typeof getApiContext>>);
    vi.mocked(createBrand).mockResolvedValue(brand as Awaited<ReturnType<typeof createBrand>>);
    vi.mocked(getBrandByName).mockResolvedValue(brand as Awaited<ReturnType<typeof getBrandByName>>);
    vi.mocked(listCompetitors).mockResolvedValue([]);
    vi.mocked(listUseCases).mockResolvedValue([]);
    vi.mocked(startSetupRun).mockResolvedValue({
      run: setupRun as Awaited<ReturnType<typeof startSetupRun>>["run"],
      created: true,
    });
    mockCompletedCheckoutSession();
  });

  it("resumes a replayed checkout-return brand create and starts setup with the brand id", async () => {
    vi.mocked(createBrand).mockRejectedValue(new BrandExistsError("Acme"));

    const response = await POST(
      jsonRequest(onboardingBody({ resumeExisting: true, checkoutSessionId })),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.brand).toEqual({ id: brand.id, name: brand.name });
    expect(getBrandByName).toHaveBeenCalledWith(workspaceId, "Acme");
    expect(upsertBrandProfile).toHaveBeenCalledWith(scope, expect.objectContaining({
      website: "https://acme.test",
      productDescription: "Analytics for growing teams.",
    }));
    expect(setActiveBrandCookie).toHaveBeenCalledWith(brand.id);
    expect(startSetupRun).toHaveBeenCalledWith(scope);
    expect(triggerSetupRun).toHaveBeenCalledWith(scope, "startup", expect.objectContaining({
      id: setupRun.id,
    }), { resume: false });
  });

  it("rejects resumeExisting when it is not tied to a checkout replay", async () => {
    vi.mocked(createBrand).mockRejectedValue(new BrandExistsError("Acme"));

    const response = await POST(jsonRequest(onboardingBody({ resumeExisting: true })));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.details).toEqual({ code: "BRAND_EXISTS" });
    expect(getBrandByName).toHaveBeenCalledWith(workspaceId, "Acme");
    expect(upsertBrandProfile).not.toHaveBeenCalled();
    expect(setActiveBrandCookie).not.toHaveBeenCalled();
    expect(startSetupRun).not.toHaveBeenCalled();
  });

  it("keeps normal duplicate brand submits strict", async () => {
    vi.mocked(createBrand).mockRejectedValue(new BrandExistsError("Acme"));

    const response = await POST(jsonRequest(onboardingBody()));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.details).toEqual({ code: "BRAND_EXISTS" });
    expect(getBrandByName).not.toHaveBeenCalled();
    expect(setActiveBrandCookie).not.toHaveBeenCalled();
  });

  it("does not duplicate onboarding competitors or use cases on retry", async () => {
    vi.mocked(listCompetitors).mockResolvedValue([
      { id: "competitor-1", brandId: brand.id, url: "https://rival.test" },
    ] as Awaited<ReturnType<typeof listCompetitors>>);
    vi.mocked(listUseCases).mockResolvedValue([
      { id: "use-case-1", brandId: brand.id, job: "Track acquisition", persona: "Founders" },
    ] as Awaited<ReturnType<typeof listUseCases>>);

    const response = await POST(
      jsonRequest(onboardingBody({ resumeExisting: true, checkoutSessionId })),
    );

    expect(response.status).toBe(201);
    expect(createCompetitors).not.toHaveBeenCalled();
    expect(createUseCase).not.toHaveBeenCalled();
  });
});
