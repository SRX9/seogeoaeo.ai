import { and, desc, eq } from "drizzle-orm";
import { getBrandProfile, type BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentJobs } from "@/lib/db/schema";
import { createAgentJob, finishAgentJob } from "@/lib/jobs/repository";
import {
  refreshSiteHealth,
  SiteUnreachableError,
} from "@/lib/visibility/site-health-refresh";

/**
 * Weekly autonomous Site Health check (autopilot). Once every
 * SITE_HEALTH_INTERVAL_DAYS the daily pipeline re-verifies every on-site
 * essential — speed (one PageSpeed call), meta, social previews, crawler
 * access, schema — and queues fixes for anything that slipped. Together with
 * the capped manual rechecks this bounds account-wide PageSpeed usage at one
 * scheduled call per brand per week. The cadence gate is the most recent
 * `site_health_check` agent job (created before the run, so a failed check
 * still waits out the interval instead of retrying daily), and the run is
 * plan-included (no credits).
 */

export const SITE_HEALTH_INTERVAL_DAYS = 7;

export type WeeklySiteHealthResult =
  | { ran: false; reason: "too_soon" | "no_website" | "site_unreachable" }
  | { ran: true; pass: number; warn: number; fail: number };

async function lastCheckAt(brandId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ createdAt: agentJobs.createdAt })
    .from(agentJobs)
    .where(and(eq(agentJobs.brandId, brandId), eq(agentJobs.kind, "site_health_check")))
    .orderBy(desc(agentJobs.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

export async function maybeRunWeeklySiteHealth(
  scope: BrandScope,
  now: Date = new Date(),
): Promise<WeeklySiteHealthResult> {
  const last = await lastCheckAt(scope.brandId);
  if (last && now.getTime() - last.getTime() < SITE_HEALTH_INTERVAL_DAYS * 86_400_000) {
    return { ran: false, reason: "too_soon" };
  }

  const website = (await getBrandProfile(scope.brandId))?.website?.trim();
  if (!website) {
    return { ran: false, reason: "no_website" };
  }

  const job = await createAgentJob(scope, "site_health_check", "Weekly site health check");
  try {
    const snapshot = await refreshSiteHealth(scope.workspaceId, website, "agent");
    const { pass, warn, fail } = snapshot.summary;
    const needsWork = warn + fail;
    await finishAgentJob(
      job.id,
      "completed",
      needsWork === 0
        ? `Checked ${pass} things on your site — everything looks great.`
        : `Checked ${pass + needsWork} things on your site — ${needsWork} need${needsWork === 1 ? "s" : ""} attention; the fixes are in your queue.`,
      { pass, warn, fail },
    );
    return { ran: true, pass, warn, fail };
  } catch (error) {
    // An unreachable site is a normal outcome (down, bot-blocked) — record it
    // and wait out the interval rather than surfacing a pipeline error.
    if (error instanceof SiteUnreachableError) {
      await finishAgentJob(job.id, "failed", `Couldn't reach ${website} — ${error.message}`);
      return { ran: false, reason: "site_unreachable" };
    }
    await finishAgentJob(job.id, "failed", "Site health check failed.");
    throw error;
  }
}
