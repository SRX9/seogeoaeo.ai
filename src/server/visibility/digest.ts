import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { brandProfiles, brands } from "@/lib/db/schema/brand";
import { answerRuns, auditFindings, audits } from "@/lib/db/schema/visibility";
import { kvGetJson, kvPutJson } from "@/lib/cloudflare/kv";
import { sendToWorkspaceOwner } from "@/lib/email/notify";
import { weeklyDigestEmail } from "@/lib/email/templates";
import { getServerEnv } from "@/lib/env";
import { buildDigest } from "@/lib/jobs/visibility-agent";
import { getUtcDayKey } from "@/lib/workspace/settings";
import { apexDomain, computeShare, type EngineName } from "@/lib/visibility/answers";
import { compareAudits } from "@/lib/visibility/compare";

/**
 * AP5 — the weekly report, Claudia's retention ritual. Fired by the Monday cron:
 * for every owned site on an active subscription, build the proof-stack digest
 * (score delta → answer share → fixes) from the latest two audits and the last
 * week of answer runs, and email it to the workspace owner. Best-effort per
 * site; a failed digest never blocks the rest.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Distinct owned (workspace, siteUrl) pairs with an active subscription. */
async function activeOwnedSites() {
  const db = getDb();
  return db
    .selectDistinctOn([audits.workspaceId, audits.siteUrl], {
      workspaceId: audits.workspaceId,
      siteUrl: audits.siteUrl,
    })
    .from(audits)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, audits.workspaceId))
    .where(
      and(
        eq(audits.kind, "owned"),
        eq(audits.status, "complete"),
        inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
      ),
    )
    .orderBy(audits.workspaceId, audits.siteUrl, desc(audits.createdAt));
}

/** The brand whose profile website sits on the same apex domain as the site. */
async function brandIdForSite(workspaceId: string, siteUrl: string): Promise<string | null> {
  const rows = await getDb()
    .select({ brandId: brands.id, website: brandProfiles.website })
    .from(brands)
    .innerJoin(brandProfiles, eq(brandProfiles.brandId, brands.id))
    .where(eq(brands.workspaceId, workspaceId));
  return rows.find((r) => r.website && apexDomain(r.website) === apexDomain(siteUrl))?.brandId ?? null;
}

async function digestForSite(workspaceId: string, siteUrl: string): Promise<string | null> {
  const db = getDb();
  // Latest two completed owned audits: [current, baseline].
  const recent = await db
    .select({ id: audits.id })
    .from(audits)
    .where(
      and(
        eq(audits.workspaceId, workspaceId),
        eq(audits.siteUrl, siteUrl),
        eq(audits.kind, "owned"),
        eq(audits.status, "complete"),
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(2);
  // A site with a single audit has no baseline yet — a zero-delta "nothing
  // moved" email on a brand-new customer's first Monday is worse than silence.
  if (recent.length < 2) return null;
  const currentId = recent[0].id;
  const baselineId = recent[1].id;
  const delta = await compareAudits(baselineId, currentId);

  // Answer share from the last week's runs (when the site maps to a brand).
  const brandId = await brandIdForSite(workspaceId, siteUrl);
  const since = new Date(Date.now() - WEEK_MS);
  const runs = brandId
    ? await db
        .select({
          engine: answerRuns.engine,
          brandMentioned: answerRuns.brandMentioned,
          brandCited: answerRuns.brandCited,
        })
        .from(answerRuns)
        .where(and(eq(answerRuns.brandId, brandId), gte(answerRuns.ranAt, since)))
    : [];
  const share = computeShare(runs as { engine: EngineName; brandMentioned: boolean; brandCited: boolean }[])
    .filter((s) => s.prompts > 0);

  // Fix counts on the current audit: applied vs awaiting one-click approval.
  const [applied] = await db
    .select({ n: count() })
    .from(auditFindings)
    .where(and(eq(auditFindings.auditId, currentId), eq(auditFindings.isResolved, true)));
  const [awaiting] = await db
    .select({ n: count() })
    .from(auditFindings)
    .where(
      and(
        eq(auditFindings.auditId, currentId),
        eq(auditFindings.fixCapability, "auto"),
        eq(auditFindings.isResolved, false),
      ),
    );

  return buildDigest({
    siteUrl,
    delta,
    answerShare: share.length > 0 ? share : undefined,
    fixesApplied: applied?.n ?? 0,
    awaitingApproval: awaiting?.n ?? 0,
  });
}

/** Build + email every due weekly digest. Returns the number sent. */
export async function sendWeeklyDigests(): Promise<number> {
  const sites = await activeOwnedSites();
  const origin = getServerEnv().BETTER_AUTH_URL ?? "https://seogeoaeo.ai";
  // Re-fire guard: the cron runs inline (no per-site checkpointing), so a
  // timeout mid-loop followed by a manual re-fire would re-email everyone
  // already sent. A KV marker per (fire day, workspace, site) makes the re-fire
  // resume instead of resend. Degrades to no dedupe off-Cloudflare (KV absent).
  const dayKey = getUtcDayKey();
  const sentKey = (workspaceId: string, siteUrl: string) =>
    `digest:sent:${dayKey}:${workspaceId}:${apexDomain(siteUrl)}`;
  let sent = 0;
  for (const site of sites) {
    try {
      if (await kvGetJson<boolean>(sentKey(site.workspaceId, site.siteUrl))) continue;
      const digest = await digestForSite(site.workspaceId, site.siteUrl);
      if (!digest) continue;
      const ok = await sendToWorkspaceOwner(
        site.workspaceId,
        weeklyDigestEmail({ siteUrl: site.siteUrl, digest, dashboardUrl: `${origin}/dashboard` }),
      );
      if (ok) {
        sent += 1;
        await kvPutJson(sentKey(site.workspaceId, site.siteUrl), true, 6 * 24 * 60 * 60);
      }
    } catch (error) {
      console.error(`[visibility] weekly digest failed for ${site.siteUrl}`, error);
    }
  }
  return sent;
}
