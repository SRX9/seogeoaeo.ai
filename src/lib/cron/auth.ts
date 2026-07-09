import { timingSafeEqual } from "node:crypto";

/**
 * Shared bearer-token check for internal cron / agent-step endpoints. The same
 * `CRON_SECRET` is presented by Cloudflare's scheduled handler and by the
 * agent-workflow Worker when it calls back into the app over HTTP.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const header = request.headers.get("x-cron-secret");
  const presented = bearer ?? header;
  if (!presented) return false;

  // Constant-time compare when lengths match; length mismatch is an instant deny.
  try {
    const a = Buffer.from(presented);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
