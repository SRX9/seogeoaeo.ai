import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  askIntentChips,
  formatAskWeekSummary,
  isAskIntentId,
  resolveAskActionRequest,
  resolveAskIntent,
  type AskAnswer,
  type AskIntentId,
  type AskRecordRef,
  type AskResult,
} from "@/lib/agent/ask-shared";
import { getAgentControlState } from "@/lib/agent/memory";
import {
  getPrimaryObjective,
  OBJECTIVE_METRICS,
  objectiveMetricSchema,
  toAgentMissionView,
} from "@/lib/agent/objectives";
import { measureObjectiveMetric } from "@/lib/agent/objective-measurements";
import { getAgentPresence, type AgentPresenceLabel } from "@/lib/agent/presence";
import { orderTasksByPlan } from "@/lib/agent/strategy";
import type { AgentMissionView } from "@/lib/agent/types";
import { listPendingTopicsForWriting } from "@/lib/articles/repository";
import type { BrandScope } from "@/lib/brand/repository";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { isActiveSubscription } from "@/lib/billing/plans";
import { getDb } from "@/lib/db";
import {
  agentActionLedger,
  agentEvents,
  agentPlanVersions,
  agentTasks,
} from "@/lib/db/schema/agent-os";
import { articles } from "@/lib/db/schema/content";
import { usageCounters } from "@/lib/db/schema/jobs";
import { answerRuns, audits } from "@/lib/db/schema/visibility";
import { listTrafficConnections } from "@/lib/integrations/google-traffic";
import { listIntegrations } from "@/lib/integrations/repository";
import { isIntegrationOperational } from "@/lib/integrations/providers";
import { getWeeklyPipelineStats } from "@/lib/jobs/repository";
import { getCreditBalance } from "@/lib/usage/credits";
import { getOpenFindings } from "@/lib/visibility/findings-repository";
import { isInstallReady } from "@/lib/visibility/fix-policy";
import {
  DAILY_RUN_SCHEDULE_LABEL,
  getNextDailyRun,
  getWeekStart,
} from "@/lib/workspace/settings";

export {
  ASK_INTENT_IDS,
  ASK_INTENTS,
  askIntentChips,
  isAskIntentId,
  isAskProposal,
  isAskRouted,
  isAskUnknown,
  resolveAskActionRequest,
  resolveAskIntent,
  type AskAnswer,
  type AskIntentId,
  type AskProposal,
  type AskRecordRef,
  type AskResult,
  type AskRouted,
  type AskSource,
  type AskUnknown,
} from "@/lib/agent/ask-shared";

/**
 * Phase 4: constrained Ask Claudia (server).
 * Structured brand data only. Never calls refreshAgentBrief / LLM.
 */

type AskContext = {
  brandName: string;
  weeklyUsage: {
    id: string;
    weekStart: string;
    articlesWritten: number;
    articlesPublished: number;
  } | null;
  objective: AgentMissionView | null;
  plan: { id: string; version: number; rationale: string } | null;
  planTasks: Array<{
    id: string;
    title: string;
    reason: string;
    expectedImpact: string | null;
    confidence: number;
    riskLevel: string;
    dependencies: string[];
    stopConditions: string[];
  }>;
  recentEvents: Array<{ id: string; summary: string; eventType: string }>;
  recentActions: Array<{
    id: string;
    actionType: string;
    resourceRef: string;
    capability: string;
    status: string;
    verificationStatus: string;
    createdAt: string;
  }>;
  pendingTopics: Array<{ id: string; title: string; thesis: string | null }>;
  openFindings: Array<{
    id: string;
    auditId: string;
    title: string;
    severity: string;
    fixCapability: string | null;
    proposed: boolean;
  }>;
  auditIds: string[];
  score: number | null;
  scoreDelta: number | null;
  answerRunIds: string[];
  answersAppeared: number;
  answersTotal: number;
  nextRunAt: string | null;
  schedule: string;
  draftCount: number;
  needsGsc: boolean;
  needsCms: boolean;
  presence: AgentPresenceLabel;
  pauseReason: string | null;
  lastRunStatus: string | null;
};

async function loadAskContext(
  scope: BrandScope,
  brandName: string,
  subscriptionStatus: string | null | undefined,
): Promise<AskContext> {
  const db = getDb();
  const weekStart = getWeekStart();
  const [
    weeklyUsageRows,
    pending,
    openFindings,
    brandAudits,
    recentAnswers,
    draftRow,
    gscSnap,
    integrations,
    credits,
    weeklyStats,
    controls,
    objectiveRow,
    latestPlans,
    recentEvents,
    recentActions,
  ] = await Promise.all([
    db
      .select({
        id: usageCounters.id,
        weekStart: usageCounters.weekStart,
        articlesWritten: usageCounters.articlesGenerated,
        articlesPublished: usageCounters.articlesPublished,
      })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.workspaceId, scope.workspaceId),
          eq(usageCounters.brandId, scope.brandId),
          eq(usageCounters.weekStart, weekStart),
        ),
      )
      .limit(1),
    listPendingTopicsForWriting(scope.brandId, 5),
    getOpenFindings(scope.workspaceId, { brandId: scope.brandId }),
    // brandId: multi-brand workspaces must never report another brand's score.
    // Prefer brand-scoped rows (same pattern as /api/visibility/summary).
    db
      .select({ id: audits.id, overall: audits.overallScore })
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
      .select({
        id: answerRuns.id,
        mentioned: answerRuns.brandMentioned,
        cited: answerRuns.brandCited,
      })
      .from(answerRuns)
      .where(eq(answerRuns.brandId, scope.brandId))
      .orderBy(desc(answerRuns.ranAt))
      .limit(12),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(eq(articles.brandId, scope.brandId), eq(articles.status, "draft"))),
    listTrafficConnections(scope.brandId),
    listIntegrations(scope.brandId),
    getCreditBalance(scope.workspaceId),
    getWeeklyPipelineStats(scope.brandId),
    getAgentControlState(scope.brandId),
    getPrimaryObjective(scope),
    db
      .select({
        id: agentPlanVersions.id,
        missionId: agentPlanVersions.missionId,
        version: agentPlanVersions.version,
        rationale: agentPlanVersions.rationale,
        evidenceSnapshot: agentPlanVersions.evidenceSnapshot,
      })
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
        ),
      )
      .orderBy(desc(agentPlanVersions.version))
      .limit(5),
    db
      .select({
        id: agentEvents.id,
        summary: agentEvents.summary,
        eventType: agentEvents.eventType,
      })
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.workspaceId, scope.workspaceId),
          eq(agentEvents.brandId, scope.brandId),
        ),
      )
      .orderBy(desc(agentEvents.createdAt))
      .limit(12),
    db
      .select({
        id: agentActionLedger.id,
        actionType: agentActionLedger.actionType,
        resourceRef: agentActionLedger.resourceRef,
        capability: agentActionLedger.capability,
        status: agentActionLedger.status,
        verificationStatus: agentActionLedger.verificationStatus,
        createdAt: agentActionLedger.createdAt,
      })
      .from(agentActionLedger)
      .where(
        and(
          eq(agentActionLedger.workspaceId, scope.workspaceId),
          eq(agentActionLedger.brandId, scope.brandId),
        ),
      )
      .orderBy(desc(agentActionLedger.createdAt))
      .limit(10),
  ]);

  const planRow = objectiveRow
    ? (latestPlans.find((plan) => plan.missionId === objectiveRow.id) ?? null)
    : null;
  const rawPlanTasks = planRow
    ? await db
        .select({
          id: agentTasks.id,
          title: agentTasks.title,
          reason: agentTasks.reason,
          expectedImpact: agentTasks.expectedImpact,
          confidence: agentTasks.confidence,
          riskLevel: agentTasks.riskLevel,
          dependencies: agentTasks.dependencies,
          input: agentTasks.input,
        })
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.workspaceId, scope.workspaceId),
            eq(agentTasks.brandId, scope.brandId),
            eq(agentTasks.planVersionId, planRow.id),
            inArray(agentTasks.status, ["planned", "scheduled", "waiting"]),
          ),
        )
        .orderBy(asc(agentTasks.scheduledFor), asc(agentTasks.createdAt))
        .limit(50)
    : [];
  const planTasks = planRow
    ? orderTasksByPlan(rawPlanTasks, planRow.evidenceSnapshot)
    : rawPlanTasks;
  const parsedObjectiveMetric = objectiveMetricSchema.safeParse(objectiveRow?.metric);
  const objectiveMeasurement = parsedObjectiveMetric.success
    ? await measureObjectiveMetric(scope, parsedObjectiveMetric.data)
    : null;

  const latest = brandAudits[0]?.overall ?? null;
  const previous = brandAudits[1]?.overall ?? null;

  const draftCount = Number(draftRow[0]?.n ?? 0);
  const needsGsc = !gscSnap.some((connection) => connection.source === "gsc");
  const needsCms = integrations.length > 0 && !integrations.some(isIntegrationOperational);

  const active = isActiveSubscription(subscriptionStatus);
  let agentState = "active";
  if (!active) agentState = "paused_no_subscription";
  else if (credits.total < CREDIT_COSTS.article_generation) agentState = "paused_no_credits";
  else if (controls.paused) agentState = "paused_by_owner";

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
    weeklyUsage: weeklyUsageRows[0] ?? null,
    objective: objectiveRow
      ? toAgentMissionView(objectiveRow, objectiveMeasurement)
      : null,
    plan: planRow
      ? { id: planRow.id, version: planRow.version, rationale: planRow.rationale }
      : null,
    planTasks: planTasks.map((task) => ({
      id: task.id,
      title: task.title,
      reason: task.reason,
      expectedImpact: task.expectedImpact,
      confidence: task.confidence,
      riskLevel: task.riskLevel,
      dependencies: task.dependencies,
      stopConditions: Array.isArray(task.input?.stopConditions)
        ? task.input.stopConditions.filter(
            (condition): condition is string => typeof condition === "string",
          )
        : [],
    })),
    recentEvents,
    recentActions: recentActions.map((action) => ({
      ...action,
      createdAt: action.createdAt.toISOString(),
    })),
    pendingTopics: pending.map((topic) => ({
      id: topic.id,
      title: topic.title,
      thesis: topic.thesis ?? null,
    })),
    openFindings: sortedFindings.slice(0, 8).map((f) => ({
      id: f.id,
      auditId: f.auditId,
      title: f.title,
      severity: f.severity,
      fixCapability: f.fixCapability,
      proposed: f.proposedAt != null,
    })),
    auditIds: brandAudits.slice(0, 2).map((audit) => audit.id),
    score: latest != null ? Math.round(latest) : null,
    scoreDelta:
      latest != null && previous != null ? Math.round(latest) - Math.round(previous) : null,
    answerRunIds: recentAnswers.map((run) => run.id),
    answersAppeared: recentAnswers.filter((run) => run.mentioned || run.cited).length,
    answersTotal: recentAnswers.length,
    nextRunAt: active ? getNextDailyRun().toISOString() : null,
    schedule: DAILY_RUN_SCHEDULE_LABEL,
    draftCount,
    needsGsc,
    needsCms,
    presence,
    pauseReason: controls.pauseInstruction,
    lastRunStatus,
  };
}

function answerFor(intent: AskIntentId, ctx: AskContext): Omit<AskAnswer, "recordRefs"> {
  switch (intent) {
    case "current_objective": {
      const objective = ctx.objective;
      if (!objective || objective.configurationStatus !== "configured") {
        return {
          intent,
          answer: `I'm working toward ${objective?.objective ?? "helping more people discover your brand"}. The first reliable measurement is still being prepared, so I will keep researching, monitoring, and following your current permissions.`,
          sources: [
            { label: "Goal", href: "/settings?tab=goals" },
            { label: "Work preferences", href: "/settings?tab=preferences" },
          ],
        };
      }
      const metric = objective.metric ? OBJECTIVE_METRICS[objective.metric] : null;
      const current = objective.progress.currentValue;
      const currentLine =
        current == null
          ? "The first reliable progress reading is still being prepared."
          : `The latest ${metric?.label?.toLowerCase() ?? "result"} is ${current} ${metric?.unit ?? "units"}.`;
      return {
        intent,
        answer: [
          `I'm focused on ${objective.objective}.`,
          currentLine,
          "I'll keep researching, publishing within your preferences, and measuring what improves.",
        ]
          .filter((line): line is string => Boolean(line))
          .join("\n\n"),
        sources: [
          { label: "Goal", href: "/settings?tab=goals" },
          { label: "Work preferences", href: "/settings?tab=preferences" },
        ],
      };
    }
    case "current_plan": {
      if (!ctx.plan) {
        return {
          intent,
          answer:
            "I haven't chosen the next set of work yet. I will keep monitoring your brand and use the latest evidence to choose the most useful next step.",
          sources: [{ label: "Work direction", href: "/work" }],
        };
      }
      const tasks = ctx.planTasks
        .slice(0, 5)
        .map(
          (task, index) =>
            `${index + 1}. ${task.title}${task.expectedImpact ? ` — ${task.expectedImpact}` : ""}`,
        );
      return {
        intent,
        answer: [
          `I chose this work because ${ctx.plan.rationale}`,
          tasks.length
            ? `What comes next:\n${tasks.join("\n")}`
            : "There is no future work queued right now. I will choose the next useful step from fresh evidence.",
          "If your priorities change, tell me what matters most and I will prepare the safest next step.",
        ].join("\n\n"),
        sources: [
          { label: "Work direction", href: "/work" },
          { label: "Activity", href: "/activity" },
        ],
      };
    }
    case "action_history": {
      if (ctx.recentActions.length === 0) {
        return {
          intent,
          answer:
            "I haven't made a live change outside the app yet. Research, drafts, and website checks may still be underway.",
          sources: [
            { label: "Work history", href: "/activity" },
            { label: "Inbox", href: "/inbox" },
          ],
        };
      }
      const actions = ctx.recentActions.slice(0, 8).map(
        (action, index) =>
          `${index + 1}. ${action.actionType.replace(/[._-]/g, " ")} — ${action.verificationStatus === "verified" ? "completed and confirmed" : action.status}.`,
      );
      return {
        intent,
        answer: `Recent live changes:\n\n${actions.join("\n")}`,
        sources: [
          { label: "Work history", href: "/activity" },
          { label: "Inbox", href: "/inbox" },
        ],
      };
    }
    case "week_summary": {
      return {
        intent,
        answer: formatAskWeekSummary({
          weeklyUsage: ctx.weeklyUsage,
          visibility: ctx.score == null ? null : { score: ctx.score, delta: ctx.scoreDelta },
          aiAnswers:
            ctx.answersTotal === 0
              ? null
              : { appeared: ctx.answersAppeared, total: ctx.answersTotal },
          topFindings: ctx.openFindings.slice(0, 3),
          latestAction: ctx.recentActions[0] ?? null,
        }),
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
      const readyCount = top.filter(
        (finding) => finding.proposed && isInstallReady(finding.fixCapability),
      ).length;
      return {
        intent,
        answer: `Here are the highest-impact open issues on my list:\n\n${list}\n\n${
          readyCount > 0
            ? `${readyCount} of these have a ready-to-install fix (copy from Inbox or the fix queue, install on your site, mark done).`
            : "Most of these need a guided step: open Inbox or the fix queue for details."
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
            "I don't have another content idea queued right now. I'll research fresh opportunities automatically, or you can review Content ideas if you want to suggest one.",
          sources: [
            { label: "Content ideas", href: "/topics" },
            { label: "Content", href: "/articles" },
          ],
        };
      }
      const lines = ctx.pendingTopics.map((t, i) => {
        const thesis = t.thesis?.trim();
        return thesis ? `${i + 1}. ${t.title}: ${thesis}` : `${i + 1}. ${t.title}`;
      });
      return {
        intent,
        answer: `Here's what I'm lined up to create next:\n\n${lines.join("\n")}\n\nI work on ${ctx.schedule.toLowerCase()} within your publishing preferences and available work capacity.`,
        sources: [
          { label: "Content ideas", href: "/topics" },
          { label: "Content", href: "/articles" },
        ],
      };
    }
    case "ai_answers": {
      if (ctx.answersTotal === 0) {
        return {
          intent,
          answer:
            "I haven't checked AI answers for this brand yet. After the next discovery check, I'll show where the brand appears across ChatGPT, Perplexity, and Gemini.",
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
      const waiting = ctx.draftCount > 0 || ctx.needsGsc || ctx.needsCms;

      if (!waiting) {
        return {
          intent,
          answer:
            "Nothing needs your attention right now. New drafts and fixes will appear in the Inbox.",
          sources: [{ label: "Inbox", href: "/inbox" }],
        };
      }

      const bits: string[] = [];
      if (ctx.draftCount > 0) {
        bits.push(
          `${ctx.draftCount} article${ctx.draftCount === 1 ? "" : "s"} ready for review`,
        );
      }
      if (ctx.needsGsc) bits.push("Search Console still disconnected");
      if (ctx.needsCms) bits.push("a publishing destination still needs to be connected");
      return {
        intent,
        answer: `${bits.join("; ")}. Open Needs your input to handle the next request.`,
        sources: [{ label: "Needs your input", href: "/inbox" }],
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
          answer = `Yes. I'm working on ${ctx.brandName} right now. I'll post the result here when it is finished. The next scheduled check is around ${when}.`;
          break;
        case "Needs attention":
          answer = `I hit a technical problem while working on ${ctx.brandName}. Your saved work is safe, and the system has the details needed to investigate it.`;
          break;
        case "Paused":
          answer = ctx.pauseReason
            ? `I'm paused for ${ctx.brandName} because you said: "${ctx.pauseReason}" I won't start new work until that instruction expires or you resume me.`
            : `I'm paused for ${ctx.brandName} because the account needs attention. Your saved work is safe, and I'll continue after Billing is restored.`;
          break;
        case "Waiting for you":
          answer = `I'm waiting on one decision for ${ctx.brandName}. Open Needs your input to review my recommendation.`;
          break;
        case "Scheduled":
          answer = `My next work for ${ctx.brandName} is scheduled around ${when}.`;
          break;
        default:
          answer = `Everything is on track for ${ctx.brandName}. I'm not mid-task right now; the next scheduled check is around ${when}.`;
      }

      return {
        intent,
        answer,
        sources: [
          { label: "Home", href: "/dashboard" },
          { label: "Activity", href: "/activity" },
          { label: "Work preferences", href: "/settings?tab=preferences" },
        ],
      };
    }
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}

function dedupeRecordRefs(refs: AskRecordRef[]): AskRecordRef[] {
  const seen = new Set<string>();
  return refs
    .filter((ref) => {
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}

function objectivePlanRefs(ctx: AskContext): AskRecordRef[] {
  return [
    ...(ctx.objective
      ? [
          {
            kind: "objective" as const,
            id: ctx.objective.id,
            label: "Current goal",
            href: "/work",
          },
        ]
      : []),
    ...(ctx.plan
      ? [
          {
            kind: "plan" as const,
            id: ctx.plan.id,
            label: "Current work direction",
            href: "/work",
          },
        ]
      : []),
  ];
}

function objectiveMeasurementRefs(ctx: AskContext): AskRecordRef[] {
  const kindMap: Record<
    string,
    { kind: AskRecordRef["kind"]; href: string }
  > = {
    answer_run: { kind: "answer_run", href: "/visibility/answers" },
    audit: { kind: "audit", href: "/visibility" },
    audit_finding: { kind: "finding", href: "/visibility/fixes" },
    article_publication: { kind: "publication", href: "/articles" },
    publication_gate_run: { kind: "publication_gate", href: "/articles" },
  };
  return (ctx.objective?.progress.recordRefs ?? []).flatMap((reference) => {
    const separator = reference.indexOf(":");
    if (separator < 1) return [];
    const sourceKind = reference.slice(0, separator);
    const id = reference.slice(separator + 1);
    const mapped = kindMap[sourceKind];
    if (!mapped || !id) return [];
    return [
      {
        kind: mapped.kind,
        id,
        label: `Objective measurement: ${sourceKind.replaceAll("_", " ")}`,
        href: mapped.href,
      },
    ];
  });
}

function recordRefsFor(intent: AskIntentId, ctx: AskContext): AskRecordRef[] {
  const planRefs = objectivePlanRefs(ctx);
  const tasks = ctx.planTasks.map((task) => ({
    kind: "task" as const,
    id: task.id,
    label: task.title,
    href: "/work",
  }));
  const events = ctx.recentEvents.map((event) => ({
    kind: "event" as const,
    id: event.id,
    label: event.summary,
    href: "/activity",
  }));
  const actions = ctx.recentActions.map((action) => ({
    kind: "action" as const,
    id: action.id,
    label: `${action.actionType}: ${action.resourceRef}`,
    href: "/activity",
  }));
  const findings = ctx.openFindings.map((finding) => ({
    kind: "finding" as const,
    id: finding.id,
    label: finding.title,
    href: "/visibility/fixes",
  }));
  const audits = ctx.auditIds.map((id, index) => ({
    kind: "audit" as const,
    id,
    label: index === 0 ? "Latest completed audit" : "Previous completed audit",
    href: `/visibility/${id}`,
  }));
  const topics = ctx.pendingTopics.map((topic) => ({
    kind: "topic" as const,
    id: topic.id,
    label: topic.title,
    href: "/topics",
  }));
  const answerRuns = ctx.answerRunIds.map((id, index) => ({
    kind: "answer_run" as const,
    id,
    label: `AI answer check ${index + 1}`,
    href: "/visibility/answers",
  }));
  const weeklyUsage = ctx.weeklyUsage
    ? [
        {
          kind: "usage_counter" as const,
          id: ctx.weeklyUsage.id,
          label: `Content output for week of ${ctx.weeklyUsage.weekStart}`,
          href: "/activity",
        },
      ]
    : [];

  switch (intent) {
    case "current_objective":
      return dedupeRecordRefs([
        ...planRefs.slice(0, 1),
        ...objectiveMeasurementRefs(ctx),
      ]);
    case "current_plan":
      return dedupeRecordRefs([...planRefs, ...tasks.slice(0, 8)]);
    case "action_history":
      return dedupeRecordRefs(actions.slice(0, 8));
    case "week_summary":
      return dedupeRecordRefs([
        ...weeklyUsage,
        ...audits,
        ...answerRuns,
        ...findings.slice(0, 3),
        ...actions.slice(0, 1),
      ]);
    case "blocking_scores":
      return dedupeRecordRefs([...audits, ...findings]);
    case "writing_next":
      return dedupeRecordRefs([...planRefs, ...tasks, ...topics]);
    case "ai_answers":
      return dedupeRecordRefs(answerRuns);
    case "fixes_ready":
      return dedupeRecordRefs([...findings, ...actions]);
    case "status":
      return dedupeRecordRefs([...planRefs, ...events]);
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
  const message = input.message?.trim() ?? "";
  const actionRequest = message ? resolveAskActionRequest(message) : null;
  if (actionRequest) {
    const ctx = await loadAskContext(scope, brandName, input.subscriptionStatus);
    const recordRefs = dedupeRecordRefs([
      ...objectivePlanRefs(ctx),
      ...ctx.planTasks.map((task) => ({
        kind: "task" as const,
        id: task.id,
        label: task.title,
        href: "/activity",
      })),
    ]);
    if (actionRequest === "plan_change") {
      return {
        proposal: true,
        applied: false,
        answer:
          "I can treat that as a requested change to what I do next. I haven't changed any work yet. Review the proposal before applying it so completed work stays untouched.",
        requestedChange: message,
        route: {
          kind: "plan_review",
          label: "Review proposed change",
          href: "/settings?tab=advanced",
        },
        sources: [{ label: "Advanced settings", href: "/settings?tab=advanced" }],
        recordRefs,
      };
    }

    const isPolicy = actionRequest === "policy";
    return {
      routed: true,
      applied: false,
      answer: isPolicy
        ? "That request changes what Claudia may do without review. I haven't changed the permission. Review it first so the affected work and approval boundary are clear."
        : "That asks Claudia to make a live change. I haven't run it from this read-only answer. Open the work controls to review and start it safely.",
      route: isPolicy
        ? {
            kind: "policy",
            label: "Review permissions",
            href: "/settings?tab=advanced",
          }
        : { kind: "steering", label: "Open work preferences", href: "/settings?tab=preferences" },
      sources: [
        { label: "Permissions", href: "/settings?tab=advanced" },
        { label: "Work preferences", href: "/settings?tab=preferences" },
      ],
      recordRefs,
    };
  }

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
        "I can answer from what I know about this brand. Ask what I'm doing, what changed, what comes next, or what needs your attention—or choose one of the suggested questions.",
      intents: askIntentChips(),
    };
  }

  const ctx = await loadAskContext(scope, brandName, input.subscriptionStatus);
  return {
    ...answerFor(intentId, ctx),
    recordRefs: recordRefsFor(intentId, ctx),
  };
}
