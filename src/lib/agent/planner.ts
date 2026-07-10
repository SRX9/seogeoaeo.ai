import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentEvents,
  agentMissions,
  agentPlanVersions,
  agentTasks,
  topics,
} from "@/lib/db/schema";
import {
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
  return getDb().transaction(async (tx) => {
    const [created] = await tx
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
      const [event] = await tx
        .insert(agentEvents)
        .values({
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          missionId,
          taskId: created.id,
          eventType: "planned",
          summary: `Planned: ${created.title}`,
          data: { scheduledFor: created.scheduledFor?.toISOString() ?? null },
        })
        .returning({ id: agentEvents.id });
      if (!event) throw new Error("Planned task event could not be recorded");
      return created;
    }

    const [existing] = await tx
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Agent task could not be initialized");
    return existing;
  });
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
  if (input.status === "paused_by_owner") {
    return transitionAgentTask(scope, task.id, {
      status: "waiting",
      eventType: "blocked",
      summary: "The owner paused work before the daily pass settled.",
      outcomeRef: `daily-run:${runDate}`,
      data: input,
    });
  }
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

export async function progressDailyAgentTask(
  scope: BrandScope,
  runDate: string,
  articleId: string,
) {
  const task = await getDb().query.agentTasks.findFirst({
    where: and(
      eq(agentTasks.brandId, scope.brandId),
      eq(agentTasks.idempotencyKey, `daily:${runDate}`),
    ),
  });
  if (!task) return null;
  return recordTaskProgress(scope, task.id, "Completed an article in the daily pass.", {
    articleId,
  });
}

export async function replanAgentWork(
  scope: BrandScope,
  reason: string,
  evidence: Record<string, unknown>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { mission, plan: current } = await ensureWeeklyPlan(scope);
    const nextVersion = current.version + 1;
    const result = await getDb().transaction(async (tx) => {
      const [plan] = await tx
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
      if (!plan) return null;

      const moved = await tx
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

      const [event] = await tx
        .insert(agentEvents)
        .values({
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          missionId: mission.id,
          eventType: "replanned",
          summary: `Plan updated: ${reason}`,
          data: {
            fromVersion: current.version,
            toVersion: plan.version,
            movedTaskCount: moved.length,
          },
        })
        .returning({ id: agentEvents.id });
      if (!event) throw new Error("Agent replan event could not be recorded");
      return { mission, current, plan, movedTaskCount: moved.length };
    });
    if (result) return result;
  }
  throw new Error("Agent plan could not be revised after concurrent updates");
}

/** Hide or restore future work when the owner pauses/resumes Claudia. */
export async function setFutureAgentTasksPaused(scope: BrandScope, paused: boolean) {
  const now = new Date();
  if (paused) {
    return getDb()
      .update(agentTasks)
      .set({ status: "waiting", updatedAt: now })
      .where(
        and(
          eq(agentTasks.brandId, scope.brandId),
          inArray(agentTasks.status, ["planned", "scheduled"]),
        ),
      )
      .returning({ id: agentTasks.id });
  }

  return getDb()
    .update(agentTasks)
    .set({
      status: sql`case when ${agentTasks.scheduledFor} is null then 'planned' else 'scheduled' end`,
      updatedAt: now,
    })
    .where(and(eq(agentTasks.brandId, scope.brandId), eq(agentTasks.status, "waiting")))
    .returning({ id: agentTasks.id });
}

/**
 * Turn a supported owner writing direction into both a ranked topic and a
 * durable task. The unique task key makes repeated steering requests retry-safe.
 */
export async function ensureOwnerDirectedWritingTask(
  scope: BrandScope,
  input: {
    missionId: string;
    planVersionId: string;
    idempotencyKey: string;
    title: string;
    instruction: string;
    paused?: boolean;
  },
) {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(agentTasks)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: input.missionId,
        planVersionId: input.planVersionId,
        title: `Write: ${input.title}`.slice(0, 300),
        reason: "The owner explicitly moved this article ahead of the normal queue.",
        taskType: "owner_directed_writing",
        executor: "daily-content-agent",
        expectedImpact: "Create the owner-requested article on the next daily pass.",
        confidence: 100,
        riskLevel: "low",
        requiredAuthority: "prepare",
        status: input.paused ? "waiting" : "scheduled",
        scheduledFor: new Date(),
        idempotencyKey: input.idempotencyKey,
        input: { instruction: input.instruction },
      })
      .onConflictDoNothing({ target: [agentTasks.brandId, agentTasks.idempotencyKey] })
      .returning();

    if (!created) {
      const [existing] = await tx
        .select()
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.brandId, scope.brandId),
            eq(agentTasks.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Owner-directed task could not be initialized");
      return { task: existing, created: false };
    }

    const [topic] = await tx
      .insert(topics)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        title: input.title,
        angle: input.instruction,
        score: 100,
        rationale: "Explicit owner direction",
        status: "pending",
        source: "owner_direction",
      })
      .returning();
    if (!topic) throw new Error("Owner-directed topic could not be initialized");

    const [task] = await tx
      .update(agentTasks)
      .set({ input: { instruction: input.instruction, topicId: topic.id } })
      .where(eq(agentTasks.id, created.id))
      .returning();
    if (!task) throw new Error("Owner-directed task could not be linked to its topic");
    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: task.missionId,
        taskId: task.id,
        eventType: "planned",
        summary: `Owner directed: ${input.title}`,
        data: { topicId: topic.id },
        actor: "owner",
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Owner-directed task event could not be recorded");
    return { task, created: true };
  });
  return result.task;
}

async function ownerDirectedTaskForTopic(brandId: string, topicId: string) {
  return getDb().query.agentTasks.findFirst({
    where: and(
      eq(agentTasks.brandId, brandId),
      eq(agentTasks.taskType, "owner_directed_writing"),
      sql`${agentTasks.input}->>'topicId' = ${topicId}`,
    ),
  });
}

export async function beginOwnerDirectedWritingTask(scope: BrandScope, topicId: string) {
  const task = await ownerDirectedTaskForTopic(scope.brandId, topicId);
  if (!task || task.status === "completed") return task ?? null;
  return transitionAgentTask(scope, task.id, {
    status: "in_progress",
    eventType: "started",
    summary: "Started the owner-directed article.",
  });
}

export async function completeOwnerDirectedWritingTask(
  scope: BrandScope,
  topicId: string,
  input: { articleId?: string; failed?: boolean; error?: string },
) {
  const task = await ownerDirectedTaskForTopic(scope.brandId, topicId);
  if (!task || task.status === "completed") return task ?? null;
  return transitionAgentTask(scope, task.id, {
    status: input.failed ? "failed" : "completed",
    eventType: input.failed ? "failed" : "completed",
    summary: input.failed
      ? `Owner-directed article failed: ${input.error ?? "generation stopped"}`
      : "Completed the owner-directed article.",
    outcomeRef: input.articleId ? `article:${input.articleId}` : null,
  });
}
