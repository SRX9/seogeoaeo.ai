import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema/visibility";
import { renderBadge } from "@/lib/growth/badge";

/**
 * V8.6 — public score badge SVG. No auth (it's meant to be embedded), cached
 * hard, and only renders for domains that have a completed audit. Links back to
 * the free checker via the badge markup the customer embeds.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const db = getDb();

  // Match the latest completed audit whose site URL contains this domain.
  const rows = await db
    .select({ siteUrl: audits.siteUrl, score: audits.overallScore })
    .from(audits)
    .where(and(eq(audits.status, "complete"), isNotNull(audits.overallScore)))
    .orderBy(desc(audits.createdAt))
    .limit(50);
  const match = rows.find((r) => r.siteUrl.includes(domain));

  const svg = match?.score != null ? renderBadge(domain, match.score) : renderBadge(domain, 0);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
