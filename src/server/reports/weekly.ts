import { and, count, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { brands } from "@/lib/db/schema/brand";
import { articles, performanceCheckpoints, topics } from "@/lib/db/schema/content";
import { articlePublications } from "@/lib/db/schema/publications";
import { weeklyReports } from "@/lib/db/schema/reports";
import {
  answerRuns,
  auditFindings,
  audits,
  trafficConnections,
  trafficSnapshots,
} from "@/lib/db/schema/visibility";
import { sendToWorkspaceOwner } from "@/lib/email/notify";
import { weeklyReportEmail, type EmailContent } from "@/lib/email/templates";
import { getServerEnv } from "@/lib/env";
import { latestVisibilityMonitorMeta } from "@/lib/jobs/repository";
import { logInfo } from "@/lib/logging/logger";
import { computeShare, type EngineName } from "@/lib/visibility/answers";
import { compareAudits } from "@/lib/visibility/compare";
import { resolveBrandForSite } from "@/server/visibility/autonomy";
import { getWeekStart } from "@/lib/workspace/settings";

/**
 * AP5 — the weekly report, Claudia's retention ritual. One email per audited
 * SITE per week covering BOTH halves of her job in proof-stack order: score
 * delta → answer share → real traffic, then what she fixed, what she published
 * and how it's performing (C4), what's next, and at most ONE ask. Deterministic,
 * first-person templating — no LLM, so the numbers can't be hallucinated.
 * Rows land in `weekly_reports` (the /reports archive) whether or not the
 * email sends; the unique (workspace, site, week) index is the send-idempotency
 * guard. Supersedes the old `sendWeeklyDigests`.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklyReportData {
  brandName: string;
  siteUrl: string;
  weekStart: string;
  proof: {
    score: { current: number | null; baseline: number | null; delta: number } | null;
    /** Only one audit exists — deltas start next week. */
    firstWeek: boolean;
    answerShare: Array<{ engine: string; appeared: number; prompts: number }>;
    /** Null until GSC is connected — the slot becomes the ask. */
    traffic: { clicks: number; prevClicks: number; aiReferrals: number } | null;
  };
  fixes: {
    applied: number;
    proposed: number;
    verified: number;
    awaiting: number;
    examples: string[];
  };
  content: {
    published: Array<{ title: string; externalUrl: string | null; thesis: string | null }>;
    /** C4 checkpoint lines from this week, already in owner language. */
    performance: string[];
    nextWeek: Array<{ title: string; thesis: string | null }>;
    draftsAwaitingReview: number;
  };
  ask: { what: string; href: string } | null;
}

/** ONE ask, max — a report that always demands something trains people to ignore it. */
export function pickTheAsk(
  data: Omit<WeeklyReportData, "ask">,
  hasGsc: boolean,
): WeeklyReportData["ask"] {
  if (!hasGsc) {
    return {
      what: "Connect Search Console so I can show your real clicks here and find the queries you already almost rank for.",
      href: "/settings?tab=integrations",
    };
  }
  if (data.fixes.awaiting > 0) {
    return {
      what: `${data.fixes.awaiting} fix${data.fixes.awaiting === 1 ? " is" : "es are"} ready for your one-click approval.`,
      href: "/visibility/fixes",
    };
  }
  if (data.content.draftsAwaitingReview > 0) {
    return {
      what: `${data.content.draftsAwaitingReview} draft${data.content.draftsAwaitingReview === 1 ? "" : "s"} are waiting for your review.`,
      href: "/articles",
    };
  }
  return null;
}

/** Render the report to plain-text lines (the email body and archive share these). */
export function renderReportLines(data: WeeklyReportData): string[] {
  const lines: string[] = [];
  const { proof, fixes, content } = data;

  if (proof.score) {
    const s = proof.score;
    if (proof.firstWeek) {
      lines.push(
        `Your visibility score is ${s.current ?? "—"}. This is my baseline week — deltas start next Monday.`,
      );
    } else if (s.delta === 0) {
      lines.push(`Your visibility score held at ${s.current ?? "—"}.`);
    } else {
      lines.push(
        `Your visibility score moved ${s.baseline ?? "—"} → ${s.current ?? "—"} (${s.delta > 0 ? "+" : ""}${s.delta}).`,
      );
    }
  }

  for (const share of proof.answerShare) {
    lines.push(`You appeared in ${share.appeared} of ${share.prompts} tracked ${share.engine} answers.`);
  }

  if (proof.traffic) {
    const t = proof.traffic;
    const diff = t.prevClicks > 0 ? Math.round(((t.clicks - t.prevClicks) / t.prevClicks) * 100) : null;
    lines.push(
      `Google sent you ${t.clicks} click${t.clicks === 1 ? "" : "s"} this week` +
        (diff != null ? ` (${diff >= 0 ? "+" : ""}${diff}% vs last week)` : "") +
        (t.aiReferrals > 0 ? `, plus ${t.aiReferrals} visit${t.aiReferrals === 1 ? "" : "s"} from AI assistants` : "") +
        ".",
    );
  }

  if (fixes.applied > 0 || fixes.verified > 0 || fixes.awaiting > 0) {
    const parts: string[] = [];
    if (fixes.applied > 0) parts.push(`applied ${fixes.applied} fix${fixes.applied === 1 ? "" : "es"}`);
    if (fixes.verified > 0) parts.push(`verified ${fixes.verified} earlier fix${fixes.verified === 1 ? "" : "es"} held up`);
    if (parts.length > 0) lines.push(`This week I ${parts.join(" and ")}.`);
    if (fixes.examples.length > 0) lines.push(`For example: ${fixes.examples.slice(0, 2).join("; ")}.`);
  }

  if (content.published.length > 0) {
    lines.push(
      `I published ${content.published.length} article${content.published.length === 1 ? "" : "s"}: ` +
        content.published.map((a) => `"${a.title}"`).join(", ") +
        ".",
    );
  }
  lines.push(...content.performance);

  if (content.nextWeek.length > 0) {
    const next = content.nextWeek[0];
    lines.push(
      `Next up: "${next.title}"${next.thesis ? ` — ${next.thesis.charAt(0).toLowerCase()}${next.thesis.slice(1)}` : ""}`,
    );
  }

  return lines;
}

/** Compose the email (subject + shared Claudia shell) from the report data. */
export function renderWeeklyReport(data: WeeklyReportData, origin: string): EmailContent {
  const lines = renderReportLines(data);
  return weeklyReportEmail({
    brandName: data.brandName,
    siteUrl: data.siteUrl,
    lines,
    ask: data.ask ? { ...data.ask, href: `${origin}${data.ask.href}` } : null,
    reportsUrl: `${origin}/reports`,
  });
}

// ---- Assembly ----------------------------------------------------------------

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

/** Fallback display name for a site whose brand profile doesn't resolve. */
function siteDisplayName(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return siteUrl;
  }
}

export async function assembleWeeklyReport(
  workspaceId: string,
  brandId: string | null,
  siteUrl: string,
  weekStart: string,
): Promise<WeeklyReportData> {
  const db = getDb();
  const since = new Date(Date.now() - WEEK_MS);
  const twoWeeksAgo = new Date(Date.now() - 2 * WEEK_MS);
  const sinceIso = since.toISOString().slice(0, 10);
  const twoWeeksIso = twoWeeksAgo.toISOString().slice(0, 10);

  // Everything below is independent reads — batch them instead of paying a
  // round-trip of latency per query inside the per-site cron loop. The
  // brand-scoped ones (answer share, traffic, monitor attribution, content)
  // resolve empty when no brand profile matches the site: the report still
  // goes out with the site-scoped score half.
  const [brandRows, recent, awaiting, runs, gscConnRows, monitor, published, checkpoints, nextWeek, drafts] =
    await Promise.all([
      brandId
        ? db.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId)).limit(1)
        : Promise.resolve([]),
      // Score: latest two completed owned audits FOR THIS SITE.
      db
        .select({ id: audits.id, overallScore: audits.overallScore })
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
        .limit(2),
      // "Ready for your approval" = what dispatch actually proposed (Level 1 /
      // cap overflow), not every open auto-capable finding — a category the
      // owner set to Watch must not inflate this count.
      db
        .select({ n: count() })
        .from(auditFindings)
        .where(
          and(
            eq(auditFindings.workspaceId, workspaceId),
            eq(auditFindings.isResolved, false),
            isNotNull(auditFindings.proposedAt),
          ),
        ),
      brandId
        ? db
            .select({
              engine: answerRuns.engine,
              brandMentioned: answerRuns.brandMentioned,
              brandCited: answerRuns.brandCited,
            })
            .from(answerRuns)
            .where(and(eq(answerRuns.brandId, brandId), gte(answerRuns.ranAt, since)))
        : Promise.resolve([]),
      brandId
        ? db
            .select({ id: trafficConnections.id })
            .from(trafficConnections)
            .where(
              and(eq(trafficConnections.brandId, brandId), eq(trafficConnections.source, "gsc")),
            )
            .limit(1)
        : Promise.resolve([]),
      brandId ? latestVisibilityMonitorMeta(brandId, { since }) : Promise.resolve(null),
      brandId
        ? db
            .select({
              title: articles.title,
              externalUrl: articlePublications.externalUrl,
              thesis: topics.thesis,
            })
            .from(articlePublications)
            .innerJoin(articles, eq(articles.id, articlePublications.articleId))
            .leftJoin(topics, eq(topics.id, articles.topicId))
            .where(
              and(
                eq(articlePublications.brandId, brandId),
                eq(articlePublications.status, "published"),
                gte(articlePublications.publishedAt, since),
              ),
            )
        : Promise.resolve([]),
      brandId
        ? db
            .select({
              verdict: performanceCheckpoints.verdict,
              day: performanceCheckpoints.day,
              position: performanceCheckpoints.position,
              title: articles.title,
            })
            .from(performanceCheckpoints)
            .innerJoin(articles, eq(articles.id, performanceCheckpoints.articleId))
            .where(
              and(
                eq(performanceCheckpoints.brandId, brandId),
                gte(performanceCheckpoints.createdAt, since),
              ),
            )
        : Promise.resolve([]),
      brandId
        ? db
            .select({ title: topics.title, thesis: topics.thesis })
            .from(topics)
            .where(and(eq(topics.brandId, brandId), eq(topics.status, "pending")))
            .orderBy(desc(topics.score))
            .limit(3)
        : Promise.resolve([]),
      brandId
        ? db
            .select({ n: count() })
            .from(articles)
            .where(and(eq(articles.brandId, brandId), eq(articles.status, "draft")))
        : Promise.resolve([]),
    ]);

  let score: WeeklyReportData["proof"]["score"] = null;
  let firstWeek = false;
  if (recent.length >= 2) {
    const delta = await compareAudits(recent[1].id, recent[0].id);
    score = {
      current: delta.overall.current,
      baseline: delta.overall.baseline,
      delta: delta.overall.delta,
    };
  } else if (recent.length === 1) {
    firstWeek = true;
    score = { current: recent[0].overallScore ?? null, baseline: null, delta: 0 };
  }

  const answerShare = computeShare(
    runs as { engine: EngineName; brandMentioned: boolean; brandCited: boolean }[],
  )
    .filter((s) => s.prompts > 0)
    .map((s) => ({ engine: s.engine, appeared: s.appeared, prompts: s.prompts }));

  // Traffic: this week vs last from GSC snapshots; AI referrals from GA4.
  const [gscConn] = gscConnRows;
  let traffic: WeeklyReportData["proof"]["traffic"] = null;
  if (gscConn && brandId) {
    const snapshots = await db
      .select({
        source: trafficSnapshots.source,
        date: trafficSnapshots.date,
        clicks: trafficSnapshots.clicks,
        aiReferrals: trafficSnapshots.aiReferrals,
      })
      .from(trafficSnapshots)
      .where(and(eq(trafficSnapshots.brandId, brandId), gte(trafficSnapshots.date, twoWeeksIso)));
    let clicks = 0;
    let prevClicks = 0;
    let aiReferrals = 0;
    for (const snap of snapshots) {
      if (snap.source === "gsc") {
        if (snap.date >= sinceIso) clicks += snap.clicks ?? 0;
        else prevClicks += snap.clicks ?? 0;
      }
      if (snap.source === "ga4" && snap.date >= sinceIso && snap.aiReferrals) {
        for (const n of Object.values(snap.aiReferrals as Record<string, number>)) {
          aiReferrals += n;
        }
      }
    }
    traffic = { clicks, prevClicks, aiReferrals };
  }

  // Fixes: the latest monitor cycle's attribution + the current approval queue.
  const meta = monitor?.meta ?? {};
  const fixes: WeeklyReportData["fixes"] = {
    applied: meta.applied ?? 0,
    proposed: meta.proposed ?? 0,
    verified: meta.verified?.length ?? 0,
    awaiting: awaiting[0]?.n ?? 0,
    examples: (meta.verified ?? []).map((f) => f.title),
  };

  // Content: this week's publishes with their theses, C4 lines, the queue's head.
  const dedupedPublished = [...new Map(published.map((p) => [p.title, p])).values()];

  const performance = checkpoints
    .map((c) => {
      if (c.verdict === "winner") {
        return `"${c.title}" is winning — ${c.position != null ? `#${Math.round(c.position)} in search` : "growing fast"}; I queued follow-ups.`;
      }
      if (c.verdict === "stalling") {
        return `"${c.title}" is stalling${c.position != null ? ` at #${Math.round(c.position)}` : ""} — I prepared a title rescue.`;
      }
      if (c.verdict === "dead") {
        return `"${c.title}" hasn't found traction in 90 days — I've deprioritized that topic family.`;
      }
      return null;
    })
    .filter((line): line is string => line !== null);

  const base: Omit<WeeklyReportData, "ask"> = {
    brandName: brandRows[0]?.name ?? siteDisplayName(siteUrl),
    siteUrl,
    weekStart,
    proof: { score, firstWeek, answerShare, traffic },
    fixes,
    content: {
      published: dedupedPublished,
      performance,
      nextWeek,
      draftsAwaitingReview: drafts[0]?.n ?? 0,
    },
  };
  return { ...base, ask: pickTheAsk(base, Boolean(gscConn)) };
}

// ---- The sender ----------------------------------------------------------------

/** Build + archive + email every due weekly report. Returns the number emailed. */
export async function sendWeeklyReports(): Promise<number> {
  const db = getDb();
  const sites = await activeOwnedSites();
  const origin = getServerEnv().BETTER_AUTH_URL ?? "https://seogeoaeo.ai";
  const weekStart = getWeekStart();
  let sent = 0;

  for (const site of sites) {
    try {
      // Brand is attribution, not a gate: a site whose brand profile is empty
      // or on another apex still gets its report (score, fixes, the GSC ask) —
      // the brand-scoped sections simply come back empty.
      const brand = await resolveBrandForSite(site.workspaceId, site.siteUrl);

      // Idempotency: the unique (workspace, site, week) row is claimed before
      // emailing; a re-fired cron re-enters only rows without an email stamp.
      const [existing] = await db
        .select({ id: weeklyReports.id, emailedAt: weeklyReports.emailedAt })
        .from(weeklyReports)
        .where(
          and(
            eq(weeklyReports.workspaceId, site.workspaceId),
            eq(weeklyReports.siteUrl, site.siteUrl),
            eq(weeklyReports.weekStart, weekStart),
          ),
        )
        .limit(1);
      if (existing?.emailedAt) continue;

      const data = await assembleWeeklyReport(
        site.workspaceId,
        brand?.brandId ?? null,
        site.siteUrl,
        weekStart,
      );
      const email = renderWeeklyReport(data, origin);

      let reportId = existing?.id;
      if (!reportId) {
        const inserted = await db
          .insert(weeklyReports)
          .values({
            workspaceId: site.workspaceId,
            brandId: brand?.brandId ?? null,
            siteUrl: site.siteUrl,
            weekStart,
            subject: email.subject,
            bodyJson: data,
          })
          .onConflictDoNothing({
            target: [weeklyReports.workspaceId, weeklyReports.siteUrl, weeklyReports.weekStart],
          })
          .returning({ id: weeklyReports.id });
        reportId = inserted[0]?.id;
        if (!reportId) continue; // a concurrent run claimed this week
      }

      const ok = await sendToWorkspaceOwner(site.workspaceId, email);
      if (ok) {
        sent += 1;
        await db
          .update(weeklyReports)
          .set({ emailedAt: new Date() })
          .where(and(eq(weeklyReports.id, reportId), isNull(weeklyReports.emailedAt)));
      }
    } catch (error) {
      console.error(`[reports] weekly report failed for ${site.siteUrl}`, error);
    }
  }

  logInfo("reports.weekly.sent", { count: sent, weekStart });
  return sent;
}
