import { CREDIT_COSTS } from "@/lib/billing/credits";
import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";
import { grantCredits } from "@/lib/usage/credits";

/**
 * V8.6: growth funnel handoff. A public free-tool result is stashed in KV under
 * a short-lived token; signup with the token pre-fills the brand website and
 * shows "here's what we already found". Also the one-time first-audit-free grant.
 */

export interface HandoffResult {
  domain: string;
  tool: string;
  /** Small result summary to show on signup (score, top findings, etc.). */
  summary: unknown;
}

const HANDOFF_TTL_SECONDS = 60 * 60 * 24; // 24h

/** Stash a public result and return a short-lived token to carry into signup. */
export async function storeHandoff(result: HandoffResult): Promise<string> {
  const token = crypto.randomUUID();
  await kvPutJson(`handoff:${token}`, result, HANDOFF_TTL_SECONDS);
  return token;
}

export async function readHandoff(token: string): Promise<HandoffResult | null> {
  if (!token) return null;
  return kvGetJson<HandoffResult>(`handoff:${token}`);
}

/**
 * Grant one free full audit to a new workspace. A grant (recorded in the
 * ledger), not a `CREDIT_COSTS` bypass: idempotent by workspace id, so it can
 * only ever fire once. Charging before showing value is friction at the worst
 * moment.
 */
export async function grantFirstAuditFree(workspaceId: string) {
  return grantCredits(workspaceId, CREDIT_COSTS.visibility_audit, {
    reason: "first_audit_free",
    refType: "visibility",
    refId: workspaceId,
    bucket: "purchased",
  });
}
