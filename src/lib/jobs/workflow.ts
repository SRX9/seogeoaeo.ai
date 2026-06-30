/**
 * Cloudflare Workflows throws when you `create()` an instance whose id already
 * exists. That collision is how we get same-day idempotency: the daily cron and
 * the smoke-test endpoint reuse a deterministic per-brand-day id, so a re-fire
 * is a *successful no-op*. Any *other* throw (binding down, rate limit, transient
 * 5xx) is a real error the caller must surface so the run is retried rather than
 * silently dropped.
 *
 * The binding gives no typed error, so we match the message. The platform phrases
 * the collision as "...already exists"; we match that case-insensitively.
 */
export function isWorkflowInstanceExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message);
}
