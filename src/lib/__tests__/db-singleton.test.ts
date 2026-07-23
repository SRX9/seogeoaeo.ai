import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { postgresMock, drizzleMock } = vi.hoisted(() => ({
  postgresMock: vi.fn(() => ({ kind: "postgres-client" })),
  drizzleMock: vi.fn(() => ({ kind: "drizzle-db" })),
}));

vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: drizzleMock }));
vi.mock("@/lib/cloudflare/context", () => ({
  getCloudflareRequestContext: () => undefined,
}));

const PROCESS_DB_KEY = Symbol.for("seo-ai.process-db");
const processDbCache = globalThis as unknown as Record<symbol, unknown>;

describe("direct database singleton", () => {
  beforeEach(() => {
    delete processDbCache[PROCESS_DB_KEY];
    postgresMock.mockClear();
    drizzleMock.mockClear();
    process.env.DATABASE_URL = "postgres://user:password@localhost:5432/app";
  });

  afterEach(() => {
    delete processDbCache[PROCESS_DB_KEY];
  });

  it("survives module reloads without opening another postgres client", async () => {
    const firstModule = await import("@/lib/db");
    const first = firstModule.getDb();

    vi.resetModules();
    const reloadedModule = await import("@/lib/db");
    const second = reloadedModule.getDb();

    expect(second).toBe(first);
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://user:password@localhost:5432/app",
      { prepare: false, max: 5 },
    );
    expect(drizzleMock).toHaveBeenCalledTimes(1);
  });
});
