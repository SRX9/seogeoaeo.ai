import { and, desc, eq, sql } from "drizzle-orm";
import {
  askIntentChips,
  isAskIntentId,
  resolveAskIntent,
  type AskAnswer,
  type AskIntentId,
  type AskResult,
} from "@/lib/agent/ask-shared";
import { getStoredAgentBrief } from "@/lib/agent/brief";
import { getAgentPresence, type AgentPresenceLabel } from "@/lib/agent/presence";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import type { BrandScope } from "@/lib/brand/repository";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { isActiveSubscription } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import { articles } from "@/lib/db/schema/content";
import { answerRuns, audits, trafficSnapshots } from "@/lib/db/schema/visibility";
import { listIntegrations } from "@/lib/integrations/repository";
import { getUsageTotals, getWeeklyPipelineStats } from "@/lib/jobs/repository";
import { getCreditBalance } from "@/lib/usage/credits";
import { getOpenFindings } from "@/lib/visibility/findings-repository";
import { isInstallReady } from "@/lib/visibility/fix-policy";
import {
  DAILY_RUN_SCHEDULE_LABEL,
  getNextDailyRun,
} from "@/lib/workspace/settings";

export {
  ASK_INTENT_IDS,
  ASK_INTENTS,
  askIntentChips,
  isAskIntentId,
  isAskUnknown,
  resolveAskIntent,
  type AskAnswer,
  type AskIntentId,
  type AskResult,
  type AskSource,
  type AskUnknown,
} from "@/lib/agent/ask-shared";

/**
 * Phase 4 — constrained Ask Claudia (server).
 * Structured brand data only. Never calls refreshAgentBrief / LLM.
 */

type AskContext = {
  brandName: string;
  briefText: string | null;
  articlesThisWeek: number;
  publishedThisWeek: number;
  pendingTopics: Array<{ title: string; thesis: string | null }>;
  openFindings: Array<{ title: string; severity: string; fixCapability: string | null }>;
  score: number | null;
  scoreDelta: number | null;
  answersAppeared: number;
  answersTotal: number;
  nextRunAt: string | null;
  schedule: string;
  draftCount: number;
  needsGsc: boolean;
  needsCms: boolean;
  presence: AgentPresenceLabel;
  lastRunStatus: string | null;
};

async function loadAskContext(
  scope: BrandScope,
  brandName: string,
  subscriptionStatus: string | null | undefined,
): Promise<AskContext> {
  const db = getDb();
  const [
    usage,
    pending,
    openFindings,
    brandAudits,
    recentAnswers,
    brief,
    draftRow,
    gscSnap,
    integrations,
    credits,
    weeklyStats,
  ] = await Promise.all([
    getUsageTotals(scope.brandId),
    listPendingTopicsForWriting(scope.brandId, 5),
    getOpenFindings(scope.workspaceId, { brandId: scope.brandId }),
    // brandId — multi-brand workspaces must never report another brand's score.
    // Prefer brand-scoped rows (same pattern as /api/visibility/summary).
    db
      .select({ overall: audits.overallScore })
      .from(audits)
      .where(
        and(
          eq(audits.workspaceId, scope.workspaceId),
          eq(audits.brandId, scope.brandId),
          eq(audits.status, "complete"),
          eq(audits.kind, "owned"),
        ),
      )
      .orderBy(desc(audits.createdAt))
      .limit(20),
    db
      .select({ mentioned: answerRuns.brandMentioned })
      .from(answerRuns)
      .where(eq(answerRuns.brandId, scope.brandId))
      .orderBy(desc(answerRuns.ranAt))
      .limit(50),
    getStoredAgentBrief(scope.brandId),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(eq(articles.brandId, scope.brandId), eq(articles.status, "draft"))),
    db
      .select({ id: trafficSnapshots.id })
      .from(trafficSnapshots)
      .where(
        and(eq(trafficSnapshots.brandId, scope.brandId), eq(trafficSnapshots.source, "gsc")),
      )
      .limit(1),
    listIntegrations(scope.brandId),
    getCreditBalance(scope.workspaceId),
    getWeeklyPipelineStats(scope.brandId),
  ]);

  const latest = brandAudits[0]?.overall ?? null;
  const previous = brandAudits[1]?.overall ?? null;

  const draftCount = Number(draftRow[0]?.n ?? 0);
  const needsGsc = gscSnap.length === 0;
  const needsCms = integrations.length > 0 && !integrations.some((i) => i.enabled);

  const active = isActiveSubscription(subscriptionStatus);
  let agentState = "active";
  if (!active) agentState = "paused_no_subscription";
  else if (credits.total < CREDIT_COSTS.article_generation) agentState = "paused_no_credits";

  const lastRunStatus = weeklyStats.lastRun?.status ?? null;
  const presence =
    getAgentPresence({
      automation: {
        enabled: active,
        agentState,
        lastRun: lastRunStatus ? { status: lastRunStatus } : null,
      },
      activityInFlight: lastRunStatus === "running",
    })?.label ?? "On duty";

  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedFindings = [...openFindings].sort(
    (a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9),
  );

  return {
    brandName,
    briefText: brief?.text ?? null,
    articlesThisWeek: usage.thisWeek.articlesWritten,
    publishedThisWeek: usage.thisWeek.articlesPublished,
    pendingTopics: pending.map((t) => ({ title: t.title, thesis: t.thesis ?? null })),
    openFindings: sortedFindings.slice(0, 8).map((f) => ({
      title: f.title,
      severity: f.severity,
      fixCapability: f.fixCapability,
    })),
    score: latest != null ? Math.round(latest) : null,
    scoreDelta:
      latest != null && previous != null ? Math.round(latest) - Math.round(previous) : null,
    answersAppeared: recentAnswers.filter((r) => r.mentioned).length,
    answersTotal: recentAnswers.length,
    nextRunAt: active ? getNextDailyRun().toISOString() : null,
    schedule: DAILY_RUN_SCHEDULE_LABEL,
    draftCount,
    needsGsc,
    needsCms,
    presence,
    lastRunStatus,
  };
}

function answerFor(intent: AskIntentId, ctx: AskContext): AskAnswer {
  switch (intent) {
    case "week_summary": {
      const lines: string[] = [];
      if (ctx.briefText) {
        lines.push(ctx.briefText);
      } else {
        lines.push(
          ctx.articlesThisWeek > 0
            ? `This week I wrote ${ctx.articlesThisWeek} article${ctx.articlesThisWeek === 1 ? "" : "s"} (${ctx.publishedThisWeek} published).`
            : "I haven't written new articles yet this week — research or setup may still be filling the queue.",
        );
        if (ctx.score != null) {
          lines.push(
            ctx.scoreDelta != null && ctx.scoreDelta !== 0
              ? `Your visibility score is ${ctx.score} (${ctx.scoreDelta > 0 ? "+" : ""}${ctx.scoreDelta} vs last audit).`
              : `Your visibility score is ${ctx.score}.`,
          );
        }
      }
      return {
        intent,
        answer: lines.join("\n\n"),
        sources: [
          { label: "Home", href: "/dashboard" },
          { label: "Work log", href: "/activity" },
          { label: "Weekly reports", href: "/reports" },
        ],
      };
    }
    case "blocking_scores": {
      if (ctx.openFindings.length === 0) {
        return {
          intent,
          answer:
            ctx.score != null
              ? `Your score is ${ctx.score} and I don't have open fixes queued right now. I'll re-audit on schedule and put anything new in your inbox.`
              : "I haven't finished a full audit yet. Once I do, blockers land in your inbox ranked by impact.",
          sources: [
            { label: "Visibility scorecard", href: "/visibility" },
            { label: "Inbox", href: "/inbox" },
          ],
        };
      }
      const top = ctx.openFindings.slice(0, 5);
      const list = top.map((f, i) => `${i + 1}. [${f.severity}] ${f.title}`).join("\n");
      const readyCount = top.filter((f) => isInstallReady(f.fixCapability)).length;
      return {
        intent,
        answer: `Here are the highest-impact open issues on my list:\n\n${list}\n\n${
          readyCount > 0
            ? `${readyCount} of these have a ready-to-install fix (copy from Inbox or the fix queue, install on your site, mark done).`
            : "Most of these need a guided step — open Inbox or the fix queue for details."
        }${
          ctx.score != null
            ? `\n\nCurrent visibility score: ${ctx.score}${
                ctx.scoreDelta != null ? ` (${ctx.scoreDelta > 0 ? "+" : ""}${ctx.scoreDelta})` : ""
              }.`
            : ""
        }`,
        sources: [
          { label: "Inbox", href: "/inbox" },
          { label: "Fix queue", href: "/visibility/fixes" },
          { label: "Scorecard", href: "/visibility" },
        ],
      };
    }
    case "writing_next": {
      if (ctx.pendingTopics.length === 0) {
        return {
          intent,
          answer:
            "My topic queue is empty right now. I'll research more on my next daily pass, or you can open Workshop → Topics if you want to steer.",
          sources: [
            { label: "Topics", href: "/topics" },
            { label: "Articles", href: "/articles" },
          ],
        };
      }
      const lines = ctx.pendingTopics.map((t, i) => {
        const thesis = t.thesis?.trim();
        return thesis ? `${i + 1}. ${t.title} — ${thesis}` : `${i + 1}. ${t.title}`;
      });
      return {
        intent,
        answer: `Here's what I'm lined up to write next (strongest evidence first):\n\n${lines.join("\n")}\n\nI write on cadence (${ctx.schedule}) within your plan cap.`,
        sources: [
          { label: "Topics", href: "/topics" },
          { label: "Articles", href: "/articles" },
        ],
      };
    }
    case "ai_answers": {
      if (ctx.answersTotal === 0) {
        return {
          intent,
          answer:
            "I haven't run an AI-answer check for this brand yet (or no prompts are tracked). After setup / the next visibility pass, I'll show share-of-answer across ChatGPT, Perplexity, and Gemini.",
          sources: [
            { label: "AI answers", href: "/visibility/answers" },
            { label: "Home", href: "/dashboard" },
          ],
        };
      }
      return {
        intent,
        answer: `In the latest checks I ran, you appeared in ${ctx.answersAppeared} of ${ctx.answersTotal} tracked AI answers. Open AI answers for the per-engine grid and which prompts still miss you.`,
        sources: [
          { label: "AI answers", href: "/visibility/answers" },
          { label: "Home proof", href: "/dashboard" },
        ],
      };
    }
    case "fixes_ready": {
      const readyFixes = ctx.openFindings.filter((f) => isInstallReady(f.fixCapability)).length;
      const waiting =
        ctx.draftCount > 0 ||
        ctx.openFindings.length > 0 ||
        ctx.needsGsc ||
        ctx.needsCms;

      if (!waiting) {
        return {
          intent,
          answer:
            "Nothing waiting on you right now — I've got it. If drafts or fixes appear, they'll show in Inbox.",
          sources: [{ label: "Inbox", href: "/inbox" }],
        };
      }

      const bits: string[] = [];
      if (ctx.draftCount > 0) {
        bits.push(
          `${ctx.draftCount} draft${ctx.draftCount === 1 ? "" : "s"} waiting for your review`,
        );
      }
      if (ctx.openFindings.length > 0) {
        bits.push(
          `${ctx.openFindings.length} open finding${ctx.openFindings.length === 1 ? "" : "s"} (${readyFixes} with a ready-to-install fix)`,
        );
      }
      if (ctx.needsGsc) bits.push("Search Console still disconnected");
      if (ctx.needsCms) bits.push("no CMS connected for publish");
      return {
        intent,
        answer: `${bits.join("; ")}. Open Inbox to approve drafts, install site fixes, or connect GSC/CMS.`,
        sources: [
          { label: "Inbox", href: "/inbox" },
          { label: "Fix queue", href: "/visibility/fixes" },
        ],
      };
    }
    case "status": {
      const when = ctx.nextRunAt
        ? new Date(ctx.nextRunAt).toLocaleString(undefined, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })
        : "on my usual schedule";

      let answer: string;
      switch (ctx.presence) {
        case "Working now":
          answer = `Yes — I'm working for ${ctx.brandName} right now${
            ctx.lastRunStatus ? ` (latest job: ${ctx.lastRunStatus})` : ""
          }. Cadence is ${ctx.schedule}; next planned daily pass around ${when}.`;
          break;
        case "Needs attention":
          answer = `Setup hit a wall on ${ctx.brandName} — open Home or Brand settings so we can retry.`;
          break;
        case "Paused":
          answer = `I'm paused for ${ctx.brandName} (plan or credits). I won't run daily work until that's fixed under Brand → Billing / automation.`;
          break;
        case "Waiting for you":
          answer = `I'm waiting on an owner decision for ${ctx.brandName}. Open Inbox to review the exact blocked action.`;
          break;
        case "Scheduled":
          answer = `My next planned work for ${ctx.brandName} is scheduled around ${when}. Cadence: ${ctx.schedule}.`;
          break;
        default:
          answer = `I'm on duty for ${ctx.brandName}, not mid-job right now. Cadence: ${ctx.schedule}. Next planned daily pass around ${when}.`;
      }

      return {
        intent,
        answer,
        sources: [
          { label: "Home", href: "/dashboard" },
          { label: "Work log", href: "/activity" },
          { label: "How I work", href: "/settings?tab=automation" },
        ],
      };
    }
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

export async function answerAsk(
  scope: BrandScope,
  brandName: string,
  input: {
    intent?: string | null;
    message?: string | null;
    subscriptionStatus?: string | null;
  },
): Promise<AskResult> {
  let intentId: AskIntentId | null = null;
  if (input.intent && isAskIntentId(input.intent)) {
    intentId = input.intent;
  } else if (input.message) {
    intentId = resolveAskIntent(input.message);
  }

  if (!intentId) {
    return {
      unknown: true,
      suggestion:
        "I stay grounded in your real data — pick a question I can answer, or rephrase around scores, writing, AI mentions, or what needs your approval.",
      intents: askIntentChips(),
    };
  }

  const ctx = await loadAskContext(scope, brandName, input.subscriptionStatus);
  return answerFor(intentId, ctx);
}
