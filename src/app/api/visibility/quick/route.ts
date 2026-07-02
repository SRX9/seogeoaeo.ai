import { z } from "zod";
import { handleApi, HttpError, jsonOk, parseBody, readJson } from "@/lib/api/server";
import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";
import { assertIpRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { quickSnapshot, type QuickResult } from "@/lib/visibility/quick";

/**
 * V1.5 — public quick-snapshot endpoint (no auth: it's the lead-gen tool).
 * Rate-limited per IP; results cached in KV per domain (short TTL) and per
 * token (longer TTL) so the finding carries into signup/onboarding (V8.6).
 */

const DOMAIN_TTL_SECONDS = 60 * 60; // 1 hour per domain
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days for the signup handoff
const RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 }; // 10 runs/hour/IP

const domainKey = (domain: string) => `quick:domain:${domain}`;
const tokenKey = (token: string) => `quick:token:${token}`;

const quickSchema = z.object({
  url: z
    .string()
    .min(1)
    .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
    .pipe(z.string().url()),
});

interface StoredSnapshot {
  token: string;
  result: QuickResult;
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const { url } = parseBody(quickSchema, await readJson(request));
    // Cache by the exact page (origin + path), not just the host, so different
    // paths don't collide and one path can't poison another's cached result.
    const target = new URL(url);
    const pageKey = domainKey(`${target.origin}${target.pathname}`);

    const cached = await kvGetJson<StoredSnapshot>(pageKey);
    if (cached) {
      return jsonOk({ ...cached, cached: true });
    }

    try {
      await assertIpRateLimit(request, "visibility_quick", RATE_LIMIT.limit, RATE_LIMIT.windowMs);
    } catch (error) {
      if (error instanceof RateLimitError) throw new HttpError(429, error.message);
      throw error;
    }

    const result = await quickSnapshot(url);
    if (result.error) {
      throw new HttpError(422, `Couldn't check that site: ${result.error}`);
    }

    const stored: StoredSnapshot = { token: crypto.randomUUID(), result };
    await Promise.all([
      kvPutJson(pageKey, stored, DOMAIN_TTL_SECONDS),
      kvPutJson(tokenKey(stored.token), stored, TOKEN_TTL_SECONDS),
    ]);

    return jsonOk({ ...stored, cached: false });
  });
}

/** Re-read a snapshot by token: `GET /api/visibility/quick?token=<id>`. */
export async function GET(request: Request) {
  return handleApi(async () => {
    const token = new URL(request.url).searchParams.get("token");
    if (!token || !z.string().uuid().safeParse(token).success) {
      throw new HttpError(400, "Missing or invalid ?token");
    }
    const stored = await kvGetJson<StoredSnapshot>(tokenKey(token));
    if (!stored) throw new HttpError(404, "Snapshot not found");
    return jsonOk(stored);
  });
}
