import { lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimitBuckets } from "@/lib/db/schema";

export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded. Try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Fixed-window limiter backed by a single atomic upsert: the insert either
 * starts a fresh window or increments the live one, with the expired-window
 * reset folded into the `ON CONFLICT` update. Concurrent requests serialize on
 * the row inside Postgres, so a parallel burst can never read-modify-write its
 * way past the limit.
 */
async function assertRateLimit(bucketKey: string, limit: number, windowMs: number) {
  const now = new Date();
  const freshResetAt = new Date(now.getTime() + windowMs);
  const [row] = await getDb()
    .insert(rateLimitBuckets)
    .values({ bucketKey, count: 1, resetAt: freshResetAt })
    .onConflictDoUpdate({
      target: rateLimitBuckets.bucketKey,
      set: {
        count: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN ${freshResetAt} ELSE ${rateLimitBuckets.resetAt} END`,
      },
    })
    .returning({ count: rateLimitBuckets.count, resetAt: rateLimitBuckets.resetAt });

  if (row.count > limit) {
    throw new RateLimitError();
  }

  return { remaining: limit - row.count, resetAt: row.resetAt };
}

/**
 * Sweep buckets whose window has long passed — rows are one per (key, action)
 * and would otherwise accumulate forever (unauthenticated routes key by IP).
 * Called from the daily cron; any live window is strictly newer than the grace.
 */
export async function deleteExpiredRateLimitBuckets(): Promise<number> {
  const graceMs = 24 * 60 * 60 * 1000;
  const deleted = await getDb()
    .delete(rateLimitBuckets)
    .where(lt(rateLimitBuckets.resetAt, new Date(Date.now() - graceMs)))
    .returning({ bucketKey: rateLimitBuckets.bucketKey });
  return deleted.length;
}

export async function assertWorkspaceRateLimit(
  workspaceId: string,
  action: string,
  limit: number,
  windowMs: number,
) {
  return assertRateLimit(`workspace:${workspaceId}:${action}`, limit, windowMs);
}

/** Per-client limit for unauthenticated routes, keyed by the caller's IP. */
export async function assertIpRateLimit(
  request: Request,
  action: string,
  limit: number,
  windowMs: number,
) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  return assertRateLimit(`ip:${ip}:${action}`, limit, windowMs);
}
