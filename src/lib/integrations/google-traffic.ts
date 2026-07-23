import { and, eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { trafficConnections } from "@/lib/db/schema/visibility";
import { isQueryDataStale, syncGsc, syncGscQueries } from "@/lib/integrations/gsc";

/**
 * V6.6 connect: the glue between better-auth's Google grant and the existing
 * GSC sync functions. The OAuth tokens live in better-auth's `account` table;
 * `getAccessToken` refreshes them for us. We only map a brand to the site
 * it pulls from (in `traffic_connections`) and drive the sync. Proof is never metered.
 */

export {
  GSC_SCOPE,
  GOOGLE_TRAFFIC_SCOPES,
} from "@/lib/integrations/google-scopes";

export type TrafficSource = "gsc";

/** The user's Google grant is missing or lacks the traffic-proof scopes. */
export class GoogleReconnectError extends Error {
  constructor(message = "Connect (or reconnect) Google to grant Search Console access.") {
    super(message);
    this.name = "GoogleReconnectError";
  }
}

/**
 * A fresh, auto-refreshed Google access token for a user's linked account.
 * Passing no `headers` makes better-auth resolve by `userId` alone, so this works
 * headlessly from the daily job as well as inside a request.
 */
export async function getGoogleToken(userId: string): Promise<string> {
  try {
    const res = await getAuth().api.getAccessToken({ body: { providerId: "google", userId } });
    if (!res?.accessToken) throw new GoogleReconnectError();
    return res.accessToken;
  } catch (error) {
    if (error instanceof GoogleReconnectError) throw error;
    // No linked Google account, revoked grant, or refresh failure: all "reconnect".
    throw new GoogleReconnectError();
  }
}

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

/**
 * Keep only sites the user actually has read access to: Search Console returns
 * `siteUnverifiedUser` entries the API can't query. Pure so it's unit-testable.
 */
export function filterGscSites(
  entries: { siteUrl?: string; permissionLevel?: string }[] | undefined,
): GscSite[] {
  return (entries ?? [])
    .filter((s): s is GscSite => Boolean(s.siteUrl && s.permissionLevel && s.permissionLevel !== "siteUnverifiedUser"));
}

/**
 * List the Search Console sites the user can read, for the connect picker.
 * A 401/403 means the grant exists but lacks the GSC scope → reconnect.
 */
export async function listGscSites(userId: string, fetchImpl: typeof fetch = fetch): Promise<GscSite[]> {
  const token = await getGoogleToken(userId);
  const res = await fetchImpl("https://searchconsole.googleapis.com/webmasters/v3/sites", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new GoogleReconnectError();
  if (!res.ok) throw new Error(`GSC sites list failed (${res.status})`);
  const data = (await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
  return filterGscSites(data.siteEntry);
}

export type TrafficConnectionRow = typeof trafficConnections.$inferSelect;

export async function listTrafficConnections(brandId: string): Promise<TrafficConnectionRow[]> {
  return getDb().select().from(trafficConnections).where(eq(trafficConnections.brandId, brandId));
}

/** Save (or replace) a brand's connection for one source. */
export async function upsertTrafficConnection(
  brandId: string,
  source: TrafficSource,
  connectedByUserId: string,
  target: { siteUrl?: string | null },
): Promise<void> {
  await getDb()
    .insert(trafficConnections)
    .values({
      brandId,
      source,
      connectedByUserId,
      siteUrl: target.siteUrl ?? null,
      propertyId: null,
    })
    .onConflictDoUpdate({
      target: [trafficConnections.brandId, trafficConnections.source],
      set: {
        connectedByUserId,
        siteUrl: target.siteUrl ?? null,
        propertyId: null,
        lastError: null,
      },
    });
}

/** Remove a brand's connection(s). Does not revoke the Google grant itself. */
export async function deleteTrafficConnection(brandId: string, source?: TrafficSource): Promise<void> {
  const where = source
    ? and(eq(trafficConnections.brandId, brandId), eq(trafficConnections.source, source))
    : eq(trafficConnections.brandId, brandId);
  await getDb().delete(trafficConnections).where(where);
}

export interface TrafficSyncResult {
  source: TrafficSource;
  ok: boolean;
  days?: number;
  error?: string;
}

/**
 * Best-effort: pull Search Console traffic proof for a brand. Never throws:
 * a failed sync stamps `last_error`. Unmetered. Incomplete and historical
 * non-Search-Console connection rows are skipped.
 */
export async function syncTrafficForBrand(
  scope: BrandScope,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<TrafficSyncResult[]> {
  const connections = await listTrafficConnections(scope.brandId);
  const results: TrafficSyncResult[] = [];

  for (const conn of connections) {
    if (conn.source !== "gsc" || !conn.siteUrl) continue;
    const source: TrafficSource = "gsc";
    try {
      const token = await getGoogleToken(conn.connectedByUserId);
      const days = await syncGsc(scope.brandId, conn.siteUrl, token, { fetchImpl: opts.fetchImpl });
      // C2: the query×page report refreshes weekly, riding the daily sync's
      // token. Best-effort: a failed report never fails the daily pull.
      try {
        if (await isQueryDataStale(scope.brandId)) {
          await syncGscQueries(scope.brandId, conn.siteUrl, token, { fetchImpl: opts.fetchImpl });
        }
      } catch (error) {
        console.error("[google-traffic] query report sync failed", error);
      }
      await getDb()
        .update(trafficConnections)
        .set({ lastSyncedAt: new Date(), lastError: null })
        .where(eq(trafficConnections.id, conn.id));
      results.push({ source, ok: true, days });
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync failed";
      await getDb()
        .update(trafficConnections)
        .set({ lastError: message })
        .where(eq(trafficConnections.id, conn.id))
        .catch(() => {});
      results.push({ source, ok: false, error: message });
    }
  }

  return results;
}
