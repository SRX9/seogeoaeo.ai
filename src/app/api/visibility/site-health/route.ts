import { and, desc, eq } from "drizzle-orm";
import {
  assertNoSetupRunning,
  handleApi,
  HttpError,
  jsonOk,
  requireApiBrand,
} from "@/lib/api/server";
import { getBrandProfile } from "@/lib/brand/repository";
import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";
import { getDb } from "@/lib/db";
import { audits } from "@/lib/db/schema/visibility";
import {
  assertVisibilityCredits,
  InsufficientCreditsError,
  spendForVisibilityJob,
} from "@/lib/usage/credits";
import {
  refreshSiteHealth,
  siteHealthOverlayKey,
  SiteUnreachableError,
} from "@/lib/visibility/site-health-refresh";
import type { SiteHealthSnapshot } from "@/lib/visibility/site-health";

/**
 * V9: Site Health checklist. GET returns the freshest snapshot: the durable
 * one computed by the last audit (audits.site_health) or the ephemeral KV
 * overlay a "Refresh checks" run produced, whichever is newer. POST recomputes
 * live (homepage + robots + llms + sitemap + PageSpeed): KV-only per the
 * caching rule, charged like a basic tool run, with a cooldown so a double
 * click can't burn credits or PSI quota.
 */

const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
/**
 * Manual rechecks per workspace per week. PageSpeed quota is shared across
 * every account and Claudia already re-checks each site weekly, so manual
 * refreshes are a top-up, not the main loop. Tracked as a KV counter keyed by
 * the rolling UTC week: approximate on purpose (KV isn't atomic), it only has
 * to stop absurd usage, not enforce billing.
 */
const MANUAL_REFRESHES_PER_WEEK = 10;
const WEEK_MS = 7 * 86_400_000;
const QUOTA_TTL_SECONDS = 8 * 86_400; // outlives its week, then self-cleans

const quotaKey = (workspaceId: string) =>
  `site-health:refreshes:${workspaceId}:${Math.floor(Date.now() / WEEK_MS)}`;

async function refreshesUsed(workspaceId: string): Promise<number> {
  const quota = await kvGetJson<{ used: number }>(quotaKey(workspaceId));
  return quota?.used ?? 0;
}

async function latestAuditSnapshot(workspaceId: string, brandId?: string) {
  const db = getDb();
  const conditions = [
    eq(audits.workspaceId, workspaceId),
    eq(audits.status, "complete"),
    eq(audits.kind, "owned"),
  ];
  if (brandId) conditions.push(eq(audits.brandId, brandId));
  const [latest] = await db
    .select({
      siteHealth: audits.siteHealth,
      siteUrl: audits.siteUrl,
      completedAt: audits.completedAt,
    })
    .from(audits)
    .where(and(...conditions))
    .orderBy(desc(audits.createdAt))
    .limit(1);
  return latest ?? null;
}

export async function GET() {
  return handleApi(async () => {
    const { workspace, brand } = await requireApiBrand();
    const [overlay, latest, used] = await Promise.all([
      kvGetJson<SiteHealthSnapshot>(siteHealthOverlayKey(workspace.id)),
      latestAuditSnapshot(workspace.id, brand.id),
      refreshesUsed(workspace.id),
    ]);

    const auditSnapshot = (latest?.siteHealth as SiteHealthSnapshot | null) ?? null;
    const snapshot =
      overlay && (!auditSnapshot || overlay.generatedAt > auditSnapshot.generatedAt)
        ? overlay
        : auditSnapshot;

    const cooldownUntil = overlay
      ? new Date(new Date(overlay.generatedAt).getTime() + REFRESH_COOLDOWN_MS)
      : null;

    return jsonOk({
      hasData: snapshot != null,
      snapshot,
      lastAuditAt: latest?.completedAt ?? null,
      refreshCooldownUntil:
        cooldownUntil && cooldownUntil.getTime() > Date.now() ? cooldownUntil.toISOString() : null,
      refreshesLeft: Math.max(0, MANUAL_REFRESHES_PER_WEEK - used),
    });
  });
}

export async function POST() {
  return handleApi(async () => {
    const { workspace, brand } = await requireApiBrand();
    await assertNoSetupRunning(brand.id);

    // Cooldown: a refresh inside the window returns the cached snapshot free.
    // nothing meaningful changes in 15 minutes and PSI quota is shared.
    const overlay = await kvGetJson<SiteHealthSnapshot>(siteHealthOverlayKey(workspace.id));
    if (overlay && Date.now() - new Date(overlay.generatedAt).getTime() < REFRESH_COOLDOWN_MS) {
      return jsonOk({ snapshot: overlay, refreshed: false });
    }

    const used = await refreshesUsed(workspace.id);
    if (used >= MANUAL_REFRESHES_PER_WEEK) {
      throw new HttpError(
        429,
        "You've used this week's manual rechecks. Claudia re-checks your site automatically every week, and running a new audit refreshes this list too.",
        { code: "REFRESH_LIMIT" },
      );
    }

    const latest = await latestAuditSnapshot(workspace.id, brand.id);
    const siteUrl = latest?.siteUrl ?? (await getBrandProfile(brand.id))?.website;
    if (!siteUrl) {
      throw new HttpError(400, "Add a website in brand settings before running this check.", {
        code: "NO_WEBSITE",
      });
    }

    // Pre-check (402) without charging; charge only after the checks succeed.
    try {
      await assertVisibilityCredits(workspace.id, "tool_run_basic");
    } catch (error) {
      if (error instanceof InsufficientCreditsError) throw new HttpError(402, error.message);
      throw error;
    }

    let snapshot: SiteHealthSnapshot;
    try {
      snapshot = await refreshSiteHealth(workspace.id, siteUrl, "refresh");
    } catch (error) {
      if (error instanceof SiteUnreachableError) throw new HttpError(400, error.message);
      throw error;
    }

    await kvPutJson(quotaKey(workspace.id), { used: used + 1 }, QUOTA_TTL_SECONDS);
    // Stable ref for the cooldown window so concurrent POSTs share one charge.
    const cooldownBucket = Math.floor(Date.now() / REFRESH_COOLDOWN_MS);
    await spendForVisibilityJob(
      workspace.id,
      "tool_run_basic",
      `site-health:${workspace.id}:${cooldownBucket}`,
    );

    return jsonOk({ snapshot, refreshed: true });
  });
}
