import { and, desc, eq, inArray } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentMissions, agentPlanVersions, agentTasks } from "@/lib/db/schema";
import {
  appendAgentEvent,
  recordTaskProgress,
  transitionAgentTask,
} from "@/lib/agent/events";
import { getNextDailyRun, getUtcDayKey } from "@/lib/workspace/settings";

const FUTURE_TASK_STATUSES = ["planned", "scheduled", "waiting"];

function planningWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export async function ensureDefaultMission(
  scope: BrandScope,
  brandName = "this brand",
) {
  const db = getDb();
  const existing = await db.query.agentMissions.findFirst({
    where: and(eq(agentMissions.brandId, scope.brandId), eq(agentMissions.key, "primary")),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(agentMissions)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      key: "primary",
      objective: `Grow qualified discovery and trusted visibility for ${brandName}.`,
      successCondition:
        "Improve visibility, answer share, and qualified search traffic without exceeding authority or budget.",
      horizon: "ongoing",
      priority: 100,
      origin: "system_created",
    })
    .onConflictDoNothing({ target: [agentMissions.brandId, agentMissions.key] })
    .returning();
  if (created) return created;

  const winner = await db.query.agentMissions.findFirst({
    where: and(eq(agentMissions.brandId, scope.brandId), eq(agentMissions.key, "primary")),
  });
  if (!winner) throw new Error("Agent mission could not be initialized");
  return winner;
}

export async function ensureWeeklyPlan(
  scope: BrandScope,
  options: {
    brandName?: string;
    at?: Date;
    rationale?: string;
    evidence?: Record<string, unknown>;
  } = {},
) {
  const mission = await ensureDefaultMission(scope, options.brandName);
  const { start, end } = planningWindow(options.at);
  const db = getDb();
  const existing = await db.query.agentPlanVersions.findFirst({
    where: and(
      eq(agentPlanVersions.missionId, mission.id),
      eq(agentPlanVersions.windowStart, start),
    ),
    orderBy: desc(agentPlanVersions.version),
  });
  if (existing) return { mission, plan: existing };

  const [latest] = await db
    .select({ version: agentPlanVersions.version })
    .from(agentPlanVersions)
    .where(eq(agentPlanVersions.missionId, mission.id))
    .orderBy(desc(agentPlanVersions.version))
    .limit(1);
  const version = (latest?.version ?? 0) + 1;
  const [created] = await db
    .insert(agentPlanVersions)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      missionId: mission.id,
      windowStart: start,
      windowEnd: end,
      rationale:
        options.rationale ??
        "Prioritize the strongest evidence-backed visibility and content opportunities within the current budget.",
      evidenceSnapshot: options.evidence ?? { source: "operating_cadence" },
      version,
    })
    .onConflictDoNothing({
      target: [agentPlanVersions.missionId, agentPlanVersions.version],
    })
    .returning();

  const plan =
    created ??
    (await db.query.agentPlanVersions.findFirst({
      where: and(
        eq(agentPlanVersions.missionId, mission.id),
        eq(agentPlanVersions.windowStart, start),
      ),
      orderBy: desc(agentPlanVersions.version),
    }));
  if (!plan) throw new Error("Agent plan could not be initialized");
  return { mission, plan };
}

export type PlannedTaskInput = {
  title: string;
  reason: string;
  taskType: string;
  executor: string;
  idempotencyKey: string;
  expectedImpact?: string | null;
  confidence?: number;
  riskLevel?: string;
  requiredAuthority?: string;
  scheduledFor?: Date | null;
  input?: Record<string, unknown>;
};

export async function ensurePlannedTask(
  scope: BrandScope,
  missionId: string,
  planVersionId: string,
  input: PlannedTaskInput,
) {
  const [created] = await getDb()
    .insert(agentTasks)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      missionId,
      planVersionId,
      title: input.title,
      reason: input.reason,
      taskType: input.taskType,
      executor: input.executor,
      expectedImpact: input.expectedImpact ?? null,
      confidence: Math.max(0, Math.min(100, input.confidence ?? 70)),
      riskLevel: input.riskLevel ?? "low",
      requiredAuthority: input.requiredAuthority ?? "observe",
      status: input.scheduledFor ? "scheduled" : "planned",
      scheduledFor: input.scheduledFor ?? null,
      idempotencyKey: input.idempotencyKey,
      input: input.input,
    })
    .onConflictDoNothing({ target: [agentTasks.brandId, agentTasks.idempotencyKey] })
    .returning();

  if (created) {
    await appendAgentEvent(scope, {
      missionId,
      taskId: created.id,
      eventType: "planned",
      summary: `Planned: ${created.title}`,
      data: { scheduledFor: created.scheduledFor?.toISOString() ?? null },
    });
    return created;
  }

  const existing = await getDb().query.agentTasks.findFirst({
    where: and(
      eq(agentTasks.brandId, scope.brandId),
      eq(agentTasks.idempotencyKey, input.idempotencyKey),
    ),
  });
  if (!existing) throw new Error("Agent task could not be initialized");
  return existing;
}

export async function ensureNextDailyTask(
  scope: BrandScope,
  brandName?: string,
  from = new Date(),
) {
  const scheduledFor = getNextDailyRun(from);
  const { mission, plan } = await ensureWeeklyPlan(scope, { brandName, at: scheduledFor });
  return ensurePlannedTask(scope, mission.id, plan.id, {
    title: "Research and advance the best opportunity",
    reason:
      "The daily pass evaluates current evidence, refreshes the topic queue when needed, and advances the highest-confidence work.",
    taskType: "daily_growth_pass",
    executor: "daily-content-agent",
    expectedImpact: "Create or advance one evidence-backed visibility opportunity.",
    confidence: 75,
    riskLevel: "low",
    requiredAuthority: "prepare",
    scheduledFor,
    idempotencyKey: `daily:${getUtcDayKey(scheduledFor)}`,
  });
}

export async function beginDailyAgentTask(scope: BrandScope, runDate: string) {
  const at = new Date(`${runDate}T08:00:00.000Z`);
  const { mission, plan } = await ensureWeeklyPlan(scope, { at });
  const task = await ensurePlannedTask(scope, mission.id, plan.id, {
    title: "Research and advance the best opportunity",
    reason:
      "This pass uses the current plan, owner constraints, and evidence to choose the next useful content action.",
    taskType: "daily_growth_pass",
    executor: "daily-content-agent",
    expectedImpact: "Advance qualified visibility without exceeding the daily budget.",
    confidence: 75,
    riskLevel: "low",
    requiredAuthority: "prepare",
    scheduledFor: at,
    idempotencyKey: `daily:${runDate}`,
  });
  return transitionAgentTask(scope, task.id, {
    status: "in_progress",
    eventType: "started",
    summary: "Started the daily research and content pass.",
  });
}

export async function beginSetupAgentTask(scope: BrandScope) {
  const { mission, plan } = await ensureWeeklyPlan(scope);
  const task = await ensurePlannedTask(scope, mission.id, plan.id, {
    title: "Build the brand operating baseline",
    reason:
      "A reliable mission needs a site audit, buyer questions, competitor evidence, and an initial content plan.",
    taskType: "setup_run",
    executor: "setup-run-workflow",
    expectedImpact: "Create the evidence and operating context for autonomous work.",
    confidence: 95,
    riskLevel: "low",
    requiredAuthority: "observe",
    idempotencyKey: "setup:initial",
  });
  return transitionAgentTask(scope, task.id, {
    status: "in_progress",
    eventType: "started",
    summary: "Started building the brand operating baseline.",
  });
}

export async function progressSetupAgentTask(
  scope: BrandScope,
  step: string,
  note?: string,
) {
  const task = await getDb().query.agentTasks.findFirst({
    where: and(
      eq(agentTasks.brandId, scope.brandId),
      eq(agentTasks.idempotencyKey, "setup:initial"),
    ),
  });
  if (!task) return null;
  return recordTaskProgress(
    scope,
    task.id,
    note ? `${step}: ${note}` : `Completed setup step: ${step}.`,
    { step, note: note ?? null },
  );
}

export async function completeSetupAgentTask(
  scope: BrandScope,
  status: "completed" | "failed",
) {
  const task = await getDb().query.agentTasks.findFirst({
    where: and(
      eq(agentTasks.brandId, scope.brandId),
      eq(agentTasks.idempotencyKey, "setup:initial"),
    ),
  });
  if (!task) return null;
  return transitionAgentTask(scope, task.id, {
    status,
    eventType: status,
    summary:
      status === "completed"
        ? "Completed the brand operating baseline."
        : "Setup stopped before a usable baseline was created.",
    outcomeRef: "setup-run:initial",
  });
}

export async function completeDailyAgentTask(
  scope: BrandScope,
  runDate: string,
  input: { generated: number; researched: number; status: string },
) {
  const task = await getDb().query.agentTasks.findFirst({
    where: and(
      eq(agentTasks.brandId, scope.brandId),
      eq(agentTasks.idempotencyKey, `daily:${runDate}`),
    ),
  });
  if (!task) return null;
  const failed = input.status === "failed";
  return transitionAgentTask(scope, task.id, {
    status: failed ? "failed" : "completed",
    eventType: failed ? "failed" : "completed",
    summary: failed
      ? "The daily pass stopped before it could recover."
      : `Completed the daily pass: ${input.generated} article${input.generated === 1 ? "" : "s"} written, ${input.researched} topic${input.researched === 1 ? "" : "s"} researched.`,
    outcomeRef: `daily-run:${runDate}`,
    data: input,
  });
}

export async function replanAgentWork(
  scope: BrandScope,
  reason: string,
  evidence: Record<string, unknown>,
) {
  const { mission, plan: current } = await ensureWeeklyPlan(scope);
  const nextVersion = current.version + 1;
  const [next] = await getDb()
    .insert(agentPlanVersions)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      missionId: mission.id,
      windowStart: current.windowStart,
      windowEnd: current.windowEnd,
      rationale: reason,
      evidenceSnapshot: evidence,
      version: nextVersion,
      supersedesId: current.id,
      replanReason: reason,
    })
    .onConflictDoNothing({
      target: [agentPlanVersions.missionId, agentPlanVersions.version],
    })
    .returning();
  const plan =
    next ??
    (await getDb().query.agentPlanVersions.findFirst({
      where: and(
        eq(agentPlanVersions.missionId, mission.id),
        eq(agentPlanVersions.version, nextVersion),
      ),
    }));
  if (!plan) throw new Error("Agent plan could not be revised");

  const moved = await getDb()
    .update(agentTasks)
    .set({ planVersionId: plan.id, updatedAt: new Date() })
    .where(
      and(
        eq(agentTasks.brandId, scope.brandId),
        eq(agentTasks.planVersionId, current.id),
        inArray(agentTasks.status, FUTURE_TASK_STATUSES),
      ),
    )
    .returning({ id: agentTasks.id });

  await appendAgentEvent(scope, {
    missionId: mission.id,
    eventType: "replanned",
    summary: `Plan updated: ${reason}`,
    data: { fromVersion: current.version, toVersion: plan.version, movedTaskCount: moved.length },
  });
  return { mission, current, plan, movedTaskCount: moved.length };
}
