import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "@/lib/db";
import { buildRateLimitUpsertQuery } from "@/lib/security/rate-limit";

describe("rate limit upsert", () => {
  it("encodes all timestamp params before sending them to postgres-js", () => {
    const db = drizzle.mock({ schema });
    const now = new Date("2026-07-08T06:09:35.249Z");
    const freshResetAt = new Date("2026-07-08T07:09:35.249Z");

    const query = buildRateLimitUpsertQuery(
      db,
      "workspace:9f4a4b53-dfdb-4be5-bace-7e21a9d64059:brand_prefill",
      now,
      freshResetAt,
    )
      .returning({ count: schema.rateLimitBuckets.count, resetAt: schema.rateLimitBuckets.resetAt })
      .toSQL();

    expect(query.params).toEqual([
      "workspace:9f4a4b53-dfdb-4be5-bace-7e21a9d64059:brand_prefill",
      1,
      "2026-07-08T07:09:35.249Z",
      "2026-07-08T06:09:35.249Z",
      "2026-07-08T06:09:35.249Z",
      "2026-07-08T07:09:35.249Z",
    ]);
    expect(query.params.every((param) => !(param instanceof Date))).toBe(true);
  });

  it("keeps structured upsert timestamp updates on Drizzle's encoded path", () => {
    const db = drizzle.mock({ schema });
    const now = new Date("2026-07-08T06:09:35.249Z");

    const query = db
      .insert(schema.competitorContent)
      .values({
        workspaceId: "11111111-1111-1111-1111-111111111111",
        brandId: "22222222-2222-2222-2222-222222222222",
        competitorName: "Example",
        url: "https://example.com/blog",
        title: "Example Blog",
        firstSeen: now,
        lastSeen: now,
      })
      .onConflictDoUpdate({
        target: [schema.competitorContent.brandId, schema.competitorContent.url],
        set: {
          lastSeen: now,
          title: sql`excluded.title`,
          topic: sql`coalesce(excluded.topic, ${schema.competitorContent.topic})`,
        },
      })
      .toSQL();

    expect(query.params).toContain("2026-07-08T06:09:35.249Z");
    expect(query.params.every((param) => !(param instanceof Date))).toBe(true);
  });
});
