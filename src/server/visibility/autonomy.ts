import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentAutonomy } from "@/lib/db/schema/visibility";
import { brandProfiles, brands } from "@/lib/db/schema/brand";
import type { AutonomyLevel, AutonomyMode } from "@/lib/jobs/visibility-agent";
import { apexDomain } from "@/lib/visibility/answers";

/**
 * AP4 — per-category autonomy overrides. The brand's `autonomyMode` dial
 * (Autopilot / Copilot) sets the defaults; rows here are explicit per-category
 * departures from it (the V8.5 `agent_autonomy` table, now in service).
 */

function clampLevel(level: number): AutonomyLevel {
  if (level >= 2) return 2;
  if (level <= 0) return 0;
  return 1;
}

/** All explicit per-category levels for a brand, keyed by category. */
export async function getAutonomyOverrides(
  brandId: string,
): Promise<Record<string, AutonomyLevel>> {
  const rows = await getDb()
    .select({ category: agentAutonomy.category, level: agentAutonomy.level })
    .from(agentAutonomy)
    .where(eq(agentAutonomy.brandId, brandId));
  const overrides: Record<string, AutonomyLevel> = {};
  for (const row of rows) overrides[row.category] = clampLevel(row.level);
  return overrides;
}

/** Upsert one category's level (unique on brand + category). */
export async function setAutonomyLevel(
  brandId: string,
  category: string,
  level: AutonomyLevel,
): Promise<void> {
  await getDb()
    .insert(agentAutonomy)
    .values({ brandId, category, level })
    .onConflictDoUpdate({
      target: [agentAutonomy.brandId, agentAutonomy.category],
      set: { level, updatedAt: new Date() },
    });
}

export interface SiteBrand {
  brandId: string;
  autonomyMode: AutonomyMode;
}

/**
 * The brand behind an audited site: same workspace, profile website on the same
 * apex domain. (The lookup `autoApplyFixes` and the digest used to duplicate.)
 */
export async function resolveBrandForSite(
  workspaceId: string,
  siteUrl: string,
): Promise<SiteBrand | null> {
  const rows = await getDb()
    .select({
      brandId: brands.id,
      autonomyMode: brands.autonomyMode,
      website: brandProfiles.website,
    })
    .from(brands)
    .innerJoin(brandProfiles, eq(brandProfiles.brandId, brands.id))
    .where(eq(brands.workspaceId, workspaceId));
  const match = rows.find((b) => b.website && apexDomain(b.website) === apexDomain(siteUrl));
  if (!match) return null;
  return {
    brandId: match.brandId,
    autonomyMode: match.autonomyMode === "REVIEW" ? "REVIEW" : "FULL_AUTO",
  };
}
