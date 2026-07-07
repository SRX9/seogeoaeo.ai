import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brandProfiles, brands } from "@/lib/db/schema/brand";
import { audits } from "@/lib/db/schema/visibility";
import { renderBadge } from "@/lib/growth/badge";

/**
 * V8.6 — public score badge SVG. No auth (it's meant to be embedded), cached
 * hard, and only renders a score for domains that have a completed owned audit
 * AND whose brand opted in (`brands.badge_public`) — a customer's score must
 * never be publicly readable unless they chose to embed the badge. Links back
 * to the free checker via the badge markup the customer embeds.
 */

/** Hostname of a URL (scheme optional — profile websites may lack one),
 * lowercased, www-stripped; null when unparsable. */
function hostOf(url: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  // Hostname characters only — also strips ILIKE wildcards (%/_) from the param.
  const needle = domain.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9.-]/g, "");
  if (!needle) return new Response("Invalid domain", { status: 400 });
  const db = getDb();

  // Narrow in SQL (ILIKE), then require an exact host match — substring matching
  // alone would let "acme.com" hit "not-acme.com" and surface another tenant's
  // score. Owned audits only: competitor benchmarks never back a public badge.
  const rows = await db
    .select({
      siteUrl: audits.siteUrl,
      workspaceId: audits.workspaceId,
      score: audits.overallScore,
      createdAt: audits.createdAt,
    })
    .from(audits)
    .where(
      and(
        eq(audits.status, "complete"),
        eq(audits.kind, "owned"),
        isNotNull(audits.overallScore),
        sql`${audits.siteUrl} ilike ${"%" + needle + "%"}`,
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(20);
  const match = rows.find((r) => hostOf(r.siteUrl) === needle);

  // No audit for this exact domain → 404 rather than a made-up 0/100 score.
  if (match?.score == null) {
    return new Response("No completed audit for this domain", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  // Opt-in gate: the audit's workspace must have a brand on this domain with
  // the badge enabled. Same 404 as "no audit" so the endpoint can't be used to
  // probe which domains are customers.
  const optIns = await db
    .select({ website: brandProfiles.website })
    .from(brands)
    .innerJoin(brandProfiles, eq(brandProfiles.brandId, brands.id))
    .where(and(eq(brands.workspaceId, match.workspaceId), eq(brands.badgePublic, true)));
  const optedIn = optIns.some((row) => row.website && hostOf(row.website) === needle);
  if (!optedIn) {
    return new Response("No completed audit for this domain", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  const svg = renderBadge(needle, match.score);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
