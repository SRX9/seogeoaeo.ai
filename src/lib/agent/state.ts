import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { getAgentPresence } from "@/lib/agent/presence";
import { listPendingAgentApprovals } from "@/lib/agent/events";
import { getAgentControlState } from "@/lib/agent/memory";
import {
  ensureNextDailyTask,
  ensureWeeklyPlan,
  setFutureAgentTasksPaused,
} from "@/lib/agent/planner";
import type { AgentEventView, AgentState, AgentTaskView } from "@/lib/agent/types";
import { CREDIT_COSTS } from "@/lib/billing/credits";
import { isActiveSubscription } from "@/lib/billing/plans";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentEvents, agentTasks } from "@/lib/db/schema";
import { articles } from "@/lib/db/schema/content";
import { listIntegrations } from "@/lib/integrations/repository";
import { isIntegrationOperational } from "@/lib/integrations/providers";
import { listTrafficConnections } from "@/lib/integrations/google-traffic";
import { getSetupRun } from "@/lib/jobs/setup-run";
import { getWeeklyPipelineStats } from "@/lib/jobs/repository";
import { getCreditBalance } from "@/lib/usage/credits";
import { getOpenFindings } from "@/lib/visibility/findings-repository";
import { isInstallReady } from "@/lib/visibility/fix-policy";

const ACTIVE_STATUSES = ["in_progress", "running"];
const NEXT_STATUSES = ["planned", "scheduled"];
const STALE_TASK_MS = 2 * 60 * 60 * 1000;

type MaybePromise<T> = T | Promise<T>;

/**
 * Optional shared reads for composite server read models. The dashboard needs
 * several of the same datasets as the agent state; accepting their already
 * started promises avoids running those database queries twice while keeping
 * this function self-contained for every other caller.
 */
export type AgentStatePreload = {
  setup?: MaybePromise<Awaited<ReturnType<typeof getSetupRun>>>;
  credits?: MaybePromise<Awaited<ReturnType<typeof getCreditBalance>>>;
  weekly?: MaybePromise<Awaited<ReturnType<typeof getWeeklyPipelineStats>>>;
  draftRows?: MaybePromise<Array<{ id: string; title: string }>>;
  findings?: MaybePromise<Awaited<ReturnType<typeof getOpenFindings>>>;
  gscRows?: MaybePromise<Awaited<ReturnType<typeof listTrafficConnections>>>;
  integrations?: MaybePromise<Awaited<ReturnType<typeof listIntegrations>>>;
};

export function toAgentTaskView(task: typeof agentTasks.$inferSelect): AgentTaskView {
  return {
    id: task.id,
    title: task.title,
    reason: task.reason,
    taskType: task.taskType,
    status: task.status,
    expectedImpact: task.expectedImpact,
    confidence: task.confidence,
    riskLevel: task.riskLevel,
    requiredAuthority: task.requiredAuthority,
    scheduledFor: task.scheduledFor?.toISOString() ?? null,
    startedAt: task.startedAt?.toISOString() ?? null,
    artifactRef: task.artifactRef,
    outcomeRef: task.outcomeRef,
  };
}

function toAgentEventView(event: typeof agentEvents.$inferSelect): AgentEventView {
  const artifactRef = event.data?.artifactRef;
  return {
    id: event.id,
    type: event.eventType,
    summary: event.summary,
    taskId: event.taskId,
    artifactRef: typeof artifactRef === "string" ? artifactRef : null,
    createdAt: event.createdAt.toISOString(),
  };
}

/** One focused read model for presence and plan; proof remains on granular endpoints. */
export async function getAgentState(
  scope: BrandScope,
  input: {
    brandName: string;
    subscriptionStatus?: string | null;
    preload?: AgentStatePreload;
  },
): Promise<AgentState> {
  const active = isActiveSubscription(input.subscriptionStatus);
  const controls = await getAgentControlState(scope.brandId);
  const { mission, plan } = await ensureWeeklyPlan(scope, { brandName: input.brandName });
  if (active && !controls.paused) {
    await setFutureAgentTasksPaused(scope, false);
    await ensureNextDailyTask(scope, input.brandName);
  }

  const db = getDb();
  const [tasks, recentEvents, approvals, setup, credits, weekly, draftRows, findings, gscRows, integrations] = await Promise.all([
    db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.brandId, scope.brandId),
          or(
            inArray(agentTasks.status, [
              ...ACTIVE_STATUSES,
              ...NEXT_STATUSES,
              "waiting",
            ]),
            and(
              eq(agentTasks.status, "failed"),
              eq(agentTasks.planVersionId, plan.id),
            ),
          ),
        ),
      )
      .orderBy(asc(agentTasks.scheduledFor), asc(agentTasks.createdAt)),
    db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.brandId, scope.brandId))
      .orderBy(desc(agentEvents.createdAt))
      .limit(12),
    listPendingAgentApprovals(scope.brandId),
    input.preload?.setup ?? getSetupRun(scope.brandId),
    input.preload?.credits ?? getCreditBalance(scope.workspaceId),
    input.preload?.weekly ?? getWeeklyPipelineStats(scope.brandId),
    input.preload?.draftRows ??
      db
        .select({ id: articles.id, title: articles.title })
        .from(articles)
        .where(and(eq(articles.brandId, scope.brandId), eq(articles.status, "draft")))
        .orderBy(desc(articles.updatedAt))
        .limit(1),
    input.preload?.findings ?? getOpenFindings(scope.workspaceId, { brandId: scope.brandId }),
    input.preload?.gscRows ?? listTrafficConnections(scope.brandId),
    input.preload?.integrations ?? listIntegrations(scope.brandId),
  ]);

  const now = Date.now();
  const inFlight = tasks.filter((task) => ACTIVE_STATUSES.includes(task.status));
  const liveTasks = inFlight.filter(
    (task) => now - (task.updatedAt ?? task.startedAt ?? task.createdAt).getTime() < STALE_TASK_MS,
  );
  const staleTasks = inFlight.filter((task) => !liveTasks.includes(task));
  const overdueTasks = tasks.filter(
    (task) =>
      task.status === "scheduled" &&
      task.scheduledFor != null &&
      task.scheduledFor.getTime() < now - STALE_TASK_MS,
  );
  const recoveryTasks = [...staleTasks, ...overdueTasks];
  const nextTasks = tasks
    .filter(
      (task) => NEXT_STATUSES.includes(task.status) && !overdueTasks.includes(task),
    )
    .sort(
      (a, b) =>
        (a.scheduledFor?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (b.scheduledFor?.getTime() ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 2);
  const failedTasks = tasks.filter(
    (task) => task.status === "failed" && task.planVersionId === plan.id,
  );
  const installReady = findings
    .filter(
      (finding) =>
        isInstallReady(finding.fixCapability) && finding.proposedAt != null,
    )
    .toSorted((left, right) => {
      const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (rank[left.severity] ?? 9) - (rank[right.severity] ?? 9);
    });
  const missingGsc = !gscRows.some((connection) => connection.source === "gsc");
  const missingCms =
    integrations.length > 0 && !integrations.some(isIntegrationOperational);
  const ownerDependencyCount =
    approvals.length +
    (draftRows.length ? 1 : 0) +
    (installReady.length ? 1 : 0) +
    (missingGsc ? 1 : 0) +
    (missingCms ? 1 : 0);

  let agentState = "active";
  if (!active) agentState = "paused_no_subscription";
  else if (credits.total < CREDIT_COSTS.article_generation) agentState = "paused_no_credits";
  else if (controls.paused) agentState = "paused_by_owner";

  const nextScheduledAt = nextTasks[0]?.scheduledFor?.toISOString() ?? null;
  const presence =
    getAgentPresence({
      setupStatus: setup?.status ?? null,
      automation: {
        enabled: active,
        agentState,
        lastRun: weekly.lastRun ? { status: weekly.lastRun.status } : null,
      },
      inFlightTaskCount: liveTasks.length,
      staleInFlightTaskCount: recoveryTasks.length,
      pendingApprovalCount: ownerDependencyCount,
      failedTaskCount: failedTasks.length,
      nextScheduledAt,
    }) ?? {
      id: "paused" as const,
      label: "Paused" as const,
      reason: "Claudia's operating state is not available yet.",
      isWorking: false,
    };

  const approval = approvals[0];
  const waiting = approval
    ? {
        id: approval.id,
        title: `Approve ${approval.actionType}`,
        blockedValue: approval.expectedBenefit,
        actionLabel: "Review decision",
        href: "/inbox",
        kind: "approval" as const,
      }
      : recoveryTasks[0]
      ? {
          id: recoveryTasks[0].id,
          title: "Recover a stalled task",
          blockedValue: recoveryTasks[0].expectedImpact ?? recoveryTasks[0].reason,
          actionLabel: "Open work log",
          href: "/activity",
          kind: "recovery" as const,
        }
      : draftRows[0]
        ? {
            id: draftRows[0].id,
            title: `Review "${draftRows[0].title}"`,
            blockedValue: "Publishing is blocked until this held-back draft is reviewed.",
            actionLabel: "Review draft",
            href: `/articles/${draftRows[0].id}`,
            kind: "decision" as const,
          }
        : installReady[0]
          ? {
              id: installReady[0].id,
              title: installReady.length === 1 ? installReady[0].title : `Install ${installReady.length} prepared fixes`,
              blockedValue: installReady[0].recommendation,
              actionLabel: "Review fixes",
              href: "/visibility/fixes",
              kind: "decision" as const,
            }
          : missingGsc
            ? {
                id: "connect-gsc",
                title: "Connect Search Console",
                blockedValue: "Real traffic proof and near-ranking query discovery are unavailable.",
                actionLabel: "Connect",
                href: "/settings?tab=integrations",
                kind: "connection" as const,
              }
            : missingCms
              ? {
                  id: "connect-cms",
                  title: "Connect a publishing destination",
                  blockedValue: "Claudia can prepare articles but cannot publish them to the live brand site.",
                  actionLabel: "Connect",
                  href: "/settings?tab=integrations",
                  kind: "connection" as const,
                }
              : null;

  return {
    presence,
    mission: {
      id: mission.id,
      objective: mission.objective,
      successCondition: mission.successCondition,
      horizon: mission.horizon,
      origin: mission.origin,
    },
    plan: {
      id: plan.id,
      version: plan.version,
      rationale: plan.rationale,
      windowStart: plan.windowStart.toISOString(),
      windowEnd: plan.windowEnd.toISOString(),
    },
    now: liveTasks[0] ? toAgentTaskView(liveTasks[0]) : null,
    next: nextTasks.map(toAgentTaskView),
    waiting,
    recentEvents: recentEvents.map(toAgentEventView),
  };
}

export async function getTaskByIdempotencyKey(brandId: string, idempotencyKey: string) {
  return getDb().query.agentTasks.findFirst({
    where: and(eq(agentTasks.brandId, brandId), eq(agentTasks.idempotencyKey, idempotencyKey)),
  });
}

export async function listTasksByStatus(brandId: string, statuses: string[]) {
  return getDb()
    .select()
    .from(agentTasks)
    .where(and(eq(agentTasks.brandId, brandId), inArray(agentTasks.status, statuses)));
}
