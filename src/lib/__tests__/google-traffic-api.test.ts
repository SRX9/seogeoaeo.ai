import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/api/integrations/google/route";
import { getApiContext, requireApiBrand } from "@/lib/api/server";
import {
  deleteTrafficConnection,
  listGscSites,
  listTrafficConnections,
  syncTrafficForBrand,
  upsertTrafficConnection,
} from "@/lib/integrations/google-traffic";

vi.mock("@/lib/api/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/server")>();
  return { ...actual, getApiContext: vi.fn(), requireApiBrand: vi.fn() };
});

vi.mock("@/lib/integrations/google-traffic", () => ({
  // Real class so the route's `instanceof` checks still behave.
  GoogleReconnectError: class GoogleReconnectError extends Error {},
  listTrafficConnections: vi.fn(),
  listGscSites: vi.fn(),
  upsertTrafficConnection: vi.fn(),
  deleteTrafficConnection: vi.fn(),
  syncTrafficForBrand: vi.fn(),
}));

const scope = { workspaceId: "ws-1", brandId: "brand-1" };
const session = { user: { id: "user-1", email: "u@test", name: "U" } };

function post(body: unknown) {
  return new Request("https://app.test/api/integrations/google", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/integrations/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiBrand).mockResolvedValue({
      scope,
      session,
      brand: { id: "brand-1" },
    } as unknown as Awaited<ReturnType<typeof requireApiBrand>>);
    vi.mocked(getApiContext).mockResolvedValue({
      session,
      brand: { id: "brand-1" },
    } as unknown as Awaited<ReturnType<typeof getApiContext>>);
    vi.mocked(syncTrafficForBrand).mockResolvedValue([]);
  });

  it("saves the chosen GSC site and syncs once", async () => {
    const res = await POST(post({ siteUrl: "https://x.com/" }));
    expect(res.status).toBe(200);
    expect(upsertTrafficConnection).toHaveBeenCalledWith("brand-1", "gsc", "user-1", {
      siteUrl: "https://x.com/",
    });
    expect(syncTrafficForBrand).toHaveBeenCalledWith(scope);
  });

  it("ignores obsolete GA4 property payloads", async () => {
    const res = await POST(post({ propertyId: "123456789" }));
    expect(res.status).toBe(200);
    expect(upsertTrafficConnection).not.toHaveBeenCalled();
    expect(deleteTrafficConnection).not.toHaveBeenCalled();
  });

  it("disconnects all sources by default and supports source-specific cleanup", async () => {
    expect((await DELETE(new Request("https://app.test/api/integrations/google", { method: "DELETE" }))).status).toBe(200);
    expect(deleteTrafficConnection).toHaveBeenCalledWith("brand-1", undefined);

    await DELETE(new Request("https://app.test/api/integrations/google?source=gsc", { method: "DELETE" }));
    expect(deleteTrafficConnection).toHaveBeenCalledWith("brand-1", "gsc");

    await DELETE(new Request("https://app.test/api/integrations/google?source=ga4", { method: "DELETE" }));
    expect(deleteTrafficConnection).toHaveBeenCalledWith("brand-1", "ga4");
  });

  it("reports a connected GSC site without hitting Google for the site list", async () => {
    vi.mocked(listTrafficConnections).mockResolvedValue([
      {
        source: "gsc",
        siteUrl: "https://x.com/",
        propertyId: null,
        lastSyncedAt: new Date("2026-07-01T00:00:00Z"),
        lastError: null,
      },
    ] as unknown as Awaited<ReturnType<typeof listTrafficConnections>>);

    const res = await GET();
    const body = (await res.json()) as { granted: boolean; needsConnect: boolean; gsc: { connected: boolean; siteUrl: string } };
    expect(body.granted).toBe(true);
    expect(body.needsConnect).toBe(false);
    expect(body.gsc.connected).toBe(true);
    expect(body.gsc.siteUrl).toBe("https://x.com/");
    expect(listGscSites).not.toHaveBeenCalled();
  });
});
