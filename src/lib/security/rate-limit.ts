import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rateLimitBuckets } from "@/lib/db/schema";

export class RateLimitError extends Error {
  constructor(message = "Rate limit exceeded. Try again later.") {
    super(message);
    this.name = "RateLimitError";
  }
}

async function assertRateLimit(bucketKey: string, limit: number, windowMs: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const [existing] = await getDb()
    .select()
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.bucketKey, bucketKey))
    .limit(1);

  if (!existing || existing.resetAt <= now) {
    await getDb()
      .insert(rateLimitBuckets)
      .values({ bucketKey, count: 1, resetAt })
      .onConflictDoUpdate({
        target: rateLimitBuckets.bucketKey,
        set: { count: 1, resetAt },
      });
    return { remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    throw new RateLimitError();
  }

  await getDb()
    .update(rateLimitBuckets)
    .set({ count: existing.count + 1 })
    .where(eq(rateLimitBuckets.bucketKey, bucketKey));

  return { remaining: limit - existing.count - 1, resetAt: existing.resetAt };
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
