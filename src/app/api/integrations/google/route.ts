import { z } from "zod";
import { getApiContext, handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import {
  deleteTrafficConnection,
  GoogleReconnectError,
  listGscSites,
  listTrafficConnections,
  syncTrafficForBrand,
  upsertTrafficConnection,
  type GscSite,
} from "@/lib/integrations/google-traffic";

/**
 * V6.6 connect — the "Connect Search Console" surface. The OAuth redirect itself
 * is handled client-side by authClient.linkSocial; this route reports connection
 * status, lists the user's GSC sites for the picker, saves the chosen
 * site/property, and disconnects. Proof is never metered.
 */

interface SourceState {
  connected: boolean;
  siteUrl: string | null;
  propertyId: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

function emptyState(): SourceState {
  return { connected: false, siteUrl: null, propertyId: null, lastSyncedAt: null, lastError: null };
}

/** Connection status for the active brand + (when not yet connected) GSC sites to pick. */
export async function GET() {
  return handleApi(async () => {
    const { brand, session } = await getApiContext();
    if (!brand) return jsonOk({ needsConnect: true, granted: false, sites: [], gsc: emptyState(), ga4: emptyState() });

    const connections = await listTrafficConnections(brand.id);
    const gsc = emptyState();
    const ga4 = emptyState();
    for (const c of connections) {
      const target = c.source === "gsc" ? gsc : c.source === "ga4" ? ga4 : null;
      if (!target) continue;
      target.connected = true;
      target.siteUrl = c.siteUrl;
      target.propertyId = c.propertyId;
      target.lastSyncedAt = c.lastSyncedAt?.toISOString() ?? null;
      target.lastError = c.lastError;
    }

    // Only hit Google when there's a site to pick (not already connected) — keeps
    // the settings poll cheap. `granted` tells the card whether the OAuth scope is
    // present; a GoogleReconnectError means "show the Connect button".
    let sites: GscSite[] = [];
    let granted = gsc.connected;
    if (!gsc.connected) {
      try {
        sites = await listGscSites(session.user.id);
        granted = true;
      } catch (error) {
        if (!(error instanceof GoogleReconnectError)) throw error;
        granted = false;
      }
    }

    return jsonOk({ needsConnect: !granted, granted, sites, gsc, ga4 });
  });
}

const saveSchema = z.object({
  siteUrl: z.string().min(1).optional(),
  /** Empty string clears an existing GA4 connection. */
  propertyId: z.string().optional(),
});

/** Save the chosen GSC site and/or GA4 property, then sync once so the panel fills. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope, session } = await requireApiBrand();
    const { siteUrl, propertyId } = parseBody(saveSchema, await readJson(request));

    if (siteUrl) {
      await upsertTrafficConnection(scope.brandId, "gsc", session.user.id, { siteUrl });
    }
    if (propertyId !== undefined) {
      const trimmed = propertyId.trim();
      if (trimmed) {
        await upsertTrafficConnection(scope.brandId, "ga4", session.user.id, { propertyId: trimmed });
      } else {
        await deleteTrafficConnection(scope.brandId, "ga4");
      }
    }

    const sync = await syncTrafficForBrand(scope);
    return jsonOk({ ok: true, sync });
  });
}

const deleteSchema = z.object({ source: z.enum(["gsc", "ga4"]).optional() });

/** Disconnect: clear the brand's connection rows (does not revoke the Google grant). */
export async function DELETE(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const source = new URL(request.url).searchParams.get("source");
    const parsed = parseBody(deleteSchema, { source: source ?? undefined });
    await deleteTrafficConnection(scope.brandId, parsed.source);
    return jsonOk({ ok: true });
  });
}
