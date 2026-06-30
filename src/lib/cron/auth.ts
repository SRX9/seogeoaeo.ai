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
  if (auth === `Bearer ${secret}`) {
    return true;
  }

  return request.headers.get("x-cron-secret") === secret;
}
