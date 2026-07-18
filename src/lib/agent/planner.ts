import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
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

const CORRECTED_MEMORY_CONTEXT_VERSION = "claudia-memory-runtime-v1";

type MemoryCorrectionTaskSnapshot = Pick<
  typeof agentTasks.$inferSelect,
  | "taskType"
  | "title"
  | "input"
  | "attempt"
  | "startedAt"
  | "completedAt"
  | "leaseOwner"
  | "leaseExpiresAt"
  | "heartbeatAt"
  | "artifactRef"
  | "outcomeRef"
>;

type MemoryCorrectionTaskRebuild = {
  action: "rebuild";
  values: {
    parentTaskId: null;
    title: string;
    reason: string;
    executor: string;
    dependencies: string[];
    expectedImpact: string;
    confidence: number;
    riskLevel: string;
    requiredAuthority: string;
    input: Record<string, unknown>;
    attempt: number;
    startedAt: null;
    completedAt: null;
    leaseOwner: null;
    leaseExpiresAt: null;
    heartbeatAt: null;
    originalExecutorId: null;
    takeoverExecutorId: null;
    lastErrorCode: null;
    lastErrorClass: null;
    retryAfter: null;
    settledAt: null;
    artifactRef: null;
    outcomeRef: null;
  };
};

export type MemoryCorrectionTaskDisposition =
  | MemoryCorrectionTaskRebuild
  | { action: "cancel"; reason: string };

/**
 * Only fixed tasks whose durable identity has never started can be rebuilt
 * without guessing at stale planner input. They deliberately keep their row
 * and idempotency key, but every derived input/dependency/runtime field is
 * reconstructed. Unknown or previously attempted work is cancelled instead
 * of being replayed under a new plan.
 */
export function rebuildFutureTaskForMemoryCorrection(
  task: MemoryCorrectionTaskSnapshot,
  memoryCorrectionId: string,
): MemoryCorrectionTaskDisposition {
  const pristine =
    task.attempt === 0 &&
    task.startedAt === null &&
    task.completedAt === null &&
    task.leaseOwner === null &&
    task.leaseExpiresAt === null &&
    task.heartbeatAt === null &&
    task.artifactRef === null &&
    task.outcomeRef === null;
  if (!pristine) {
    return {
      action: "cancel",
      reason: "The future task had execution history and cannot be replayed safely.",
    };
  }

  const correctionContext = {
    memoryCorrectionId,
    memoryContextVersion: CORRECTED_MEMORY_CONTEXT_VERSION,
    resolveMemoryAtExecution: true,
  };
  const runtimeReset = {
    parentTaskId: null,
    dependencies: [],
    attempt: 0,
    startedAt: null,
    completedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    originalExecutorId: null,
    takeoverExecutorId: null,
    lastErrorCode: null,
    lastErrorClass: null,
    retryAfter: null,
    settledAt: null,
    artifactRef: null,
    outcomeRef: null,
  };

  if (task.taskType === "daily_growth_pass") {
    return {
      action: "rebuild",
      values: {
        ...runtimeReset,
        title: "Research and advance the best opportunity",
        reason:
          "This pass resolves current owner constraints, corrected memory, and evidence before choosing the next useful content action.",
        executor: "daily-content-agent",
        expectedImpact: "Advance qualified visibility without exceeding the daily budget.",
        confidence: 75,
        riskLevel: "low",
        requiredAuthority: "prepare",
        input: correctionContext,
      },
    };
  }

  if (task.taskType === "setup_run") {
    return {
      action: "rebuild",
      values: {
        ...runtimeReset,
        title: "Build the brand operating baseline",
        reason:
          "Build the baseline from the current brand profile, corrected memory, buyer questions, competitor evidence, and content plan.",
        executor: "setup-run-workflow",
        expectedImpact: "Create the evidence and operating context for autonomous work.",
        confidence: 95,
        riskLevel: "low",
        requiredAuthority: "observe",
        input: correctionContext,
      },
    };
  }

  if (task.taskType === "owner_directed_writing") {
    const instruction = task.input?.instruction;
    const topicId = task.input?.topicId;
    if (
      typeof instruction !== "string" ||
      instruction.trim().length === 0 ||
      typeof topicId !== "string" ||
      topicId.length === 0
    ) {
      return {
        action: "cancel",
        reason: "The owner-directed task is missing its durable owner instruction or topic.",
      };
    }
    return {
      action: "rebuild",
      values: {
        ...runtimeReset,
        title: task.title.slice(0, 300),
        reason: "The owner explicitly moved this article ahead of the normal queue.",
        executor: "daily-content-agent",
        expectedImpact: "Create the owner-requested article on the next daily pass.",
        confidence: 100,
        riskLevel: "low",
        requiredAuthority: "prepare",
        input: {
          instruction,
          topicId,
          ...correctionContext,
        },
      },
    };
  }

  return {
    action: "cancel",
    reason: "No deterministic corrected-memory rebuild exists for this task type.",
  };
}

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
    fromStatuses: ["planned", "scheduled"],
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
    fromStatuses: ["planned", "scheduled", "waiting", "failed"],
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
    fromStatuses: ["in_progress"],
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
      fromStatuses: ["in_progress"],
      status: "waiting",
      eventType: "blocked",
      summary: "The owner paused work before the daily pass settled.",
      outcomeRef: `daily-run:${runDate}`,
      data: input,
    });
  }
  const failed = input.status === "failed";
  return transitionAgentTask(scope, task.id, {
    fromStatuses: ["in_progress"],
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
  options: {
    expectedMissionDefinitionVersion?: number;
    objectiveReplanKey?: string;
    memoryCorrectionId?: string;
    memoryCorrectionBoundary?: Date;
  } = {},
) {
  if (
    (options.objectiveReplanKey !== undefined && options.objectiveReplanKey.length === 0) ||
    (options.memoryCorrectionId !== undefined && options.memoryCorrectionId.length === 0)
  ) {
    throw new Error("Replan receipt keys cannot be empty");
  }
  if (
    options.objectiveReplanKey !== undefined &&
    options.memoryCorrectionId !== undefined
  ) {
    throw new Error("A plan revision can carry only one replan receipt");
  }
  if (
    (options.memoryCorrectionId !== undefined) !==
      (options.memoryCorrectionBoundary !== undefined) ||
    (options.memoryCorrectionBoundary !== undefined &&
      !Number.isFinite(options.memoryCorrectionBoundary.getTime()))
  ) {
    throw new Error("Memory correction replans require a valid commit boundary");
  }
  const replanReceipt = options.objectiveReplanKey !== undefined
    ? { field: "objectiveReplanKey", key: options.objectiveReplanKey }
    : options.memoryCorrectionId !== undefined
      ? { field: "memoryCorrectionId", key: options.memoryCorrectionId }
      : null;
  if (
    replanReceipt !== null &&
    options.expectedMissionDefinitionVersion === undefined
  ) {
    throw new Error("Replan receipts require an expected mission definition version");
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { mission, plan: current } = await ensureWeeklyPlan(scope);
    if (
      options.expectedMissionDefinitionVersion !== undefined &&
      mission.definitionVersion !== options.expectedMissionDefinitionVersion
    ) {
      throw new Error("Objective changed before the plan revision started");
    }
    const nextVersion = current.version + 1;
    const result = await getDb().transaction(async (tx) => {
      if (options.expectedMissionDefinitionVersion !== undefined) {
        const [lockedMission] = await tx
          .select({ definitionVersion: agentMissions.definitionVersion })
          .from(agentMissions)
          .where(
            and(
              eq(agentMissions.id, mission.id),
              eq(agentMissions.workspaceId, scope.workspaceId),
              eq(agentMissions.brandId, scope.brandId),
            ),
          )
          .for("update")
          .limit(1);
        if (
          !lockedMission ||
          lockedMission.definitionVersion !== options.expectedMissionDefinitionVersion
        ) {
          throw new Error("Objective changed before the plan revision committed");
        }
      }

      if (replanReceipt) {
        const [receipt] = await tx
          .select()
          .from(agentPlanVersions)
          .where(
            and(
              eq(agentPlanVersions.workspaceId, scope.workspaceId),
              eq(agentPlanVersions.brandId, scope.brandId),
              eq(agentPlanVersions.missionId, mission.id),
              sql`${agentPlanVersions.evidenceSnapshot}->>${replanReceipt.field} = ${replanReceipt.key}`,
            ),
          )
          .orderBy(desc(agentPlanVersions.version))
          .limit(1);
        if (receipt) {
          return {
            mission,
            current,
            plan: receipt,
            movedTaskCount: 0,
            rebuiltTaskCount: 0,
            invalidatedTaskCount: 0,
            invalidatedTopicCount: 0,
            alreadyApplied: true,
          };
        }
      }

      const [plan] = await tx
        .insert(agentPlanVersions)
        .values({
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          missionId: mission.id,
          windowStart: current.windowStart,
          windowEnd: current.windowEnd,
          rationale: reason,
          evidenceSnapshot: {
            ...evidence,
            ...(replanReceipt ? { [replanReceipt.field]: replanReceipt.key } : {}),
            ...(options.memoryCorrectionBoundary
              ? { memoryCorrectionBoundary: options.memoryCorrectionBoundary.toISOString() }
              : {}),
          },
          version: nextVersion,
          supersedesId: current.id,
          replanReason: reason,
        })
        .onConflictDoNothing({
          target: [agentPlanVersions.missionId, agentPlanVersions.version],
        })
        .returning();
      if (!plan) return null;

      const now = new Date();
      let movedTaskCount = 0;
      let rebuiltTaskCount = 0;
      let invalidatedTaskCount = 0;
      let invalidatedTopicCount = 0;
      const rebuiltTaskIds: string[] = [];
      const invalidatedTaskIds: string[] = [];

      if (options.memoryCorrectionId) {
        const futureTasks = await tx
          .select()
          .from(agentTasks)
          .where(
            and(
              eq(agentTasks.workspaceId, scope.workspaceId),
              eq(agentTasks.brandId, scope.brandId),
              eq(agentTasks.planVersionId, current.id),
              inArray(agentTasks.status, FUTURE_TASK_STATUSES),
            ),
          )
          .for("update");

        for (const task of futureTasks) {
          const disposition = rebuildFutureTaskForMemoryCorrection(
            task,
            options.memoryCorrectionId,
          );
          if (disposition.action === "rebuild") {
            const [rebuilt] = await tx
              .update(agentTasks)
              .set({
                ...disposition.values,
                planVersionId: plan.id,
                updatedAt: now,
              })
              .where(
                and(
                  eq(agentTasks.id, task.id),
                  eq(agentTasks.workspaceId, scope.workspaceId),
                  eq(agentTasks.brandId, scope.brandId),
                  eq(agentTasks.planVersionId, current.id),
                  inArray(agentTasks.status, FUTURE_TASK_STATUSES),
                ),
              )
              .returning({ id: agentTasks.id });
            if (!rebuilt) throw new Error("Future task changed during corrected-memory rebuild");
            rebuiltTaskIds.push(rebuilt.id);
            continue;
          }

          const [invalidated] = await tx
            .update(agentTasks)
            .set({
              status: "cancelled",
              leaseOwner: null,
              leaseExpiresAt: null,
              heartbeatAt: null,
              retryAfter: null,
              updatedAt: now,
            })
            .where(
              and(
                eq(agentTasks.id, task.id),
                eq(agentTasks.workspaceId, scope.workspaceId),
                eq(agentTasks.brandId, scope.brandId),
                eq(agentTasks.planVersionId, current.id),
                inArray(agentTasks.status, FUTURE_TASK_STATUSES),
              ),
            )
            .returning({ id: agentTasks.id });
          if (!invalidated) throw new Error("Future task changed during memory invalidation");
          invalidatedTaskIds.push(invalidated.id);
        }

        rebuiltTaskCount = rebuiltTaskIds.length;
        invalidatedTaskCount = invalidatedTaskIds.length;
        movedTaskCount = rebuiltTaskCount;

        const correctionConsumers = Array.isArray(evidence.allowedConsumers)
          ? evidence.allowedConsumers.filter(
              (consumer): consumer is string => typeof consumer === "string",
            )
          : [];
        if (correctionConsumers.includes("research")) {
          const invalidatedTopics = await tx
            .update(topics)
            .set({ status: "invalidated", updatedAt: now })
            .where(
              and(
                eq(topics.workspaceId, scope.workspaceId),
                eq(topics.brandId, scope.brandId),
                eq(topics.source, "research"),
                inArray(topics.status, ["pending", "failed"]),
                lte(topics.createdAt, options.memoryCorrectionBoundary!),
              ),
            )
            .returning({ id: topics.id });
          invalidatedTopicCount = invalidatedTopics.length;
        }
      } else {
        const moved = await tx
          .update(agentTasks)
          .set({ planVersionId: plan.id, updatedAt: now })
          .where(
            and(
              eq(agentTasks.workspaceId, scope.workspaceId),
              eq(agentTasks.brandId, scope.brandId),
              eq(agentTasks.planVersionId, current.id),
              inArray(agentTasks.status, FUTURE_TASK_STATUSES),
            ),
          )
          .returning({ id: agentTasks.id });
        movedTaskCount = moved.length;
      }

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
            movedTaskCount,
            ...(options.memoryCorrectionId
              ? {
                  memoryCorrectionId: options.memoryCorrectionId,
                  rebuiltTaskCount,
                  invalidatedTaskCount,
                  invalidatedTaskIds,
                  invalidatedTopicCount,
                }
              : {}),
          },
        })
        .returning({ id: agentEvents.id });
      if (!event) throw new Error("Agent replan event could not be recorded");
      return {
        mission,
        current,
        plan,
        movedTaskCount,
        rebuiltTaskCount,
        invalidatedTaskCount,
        invalidatedTopicCount,
        alreadyApplied: false,
      };
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
    fromStatuses: ["planned", "scheduled", "waiting", "failed"],
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
    fromStatuses: ["in_progress"],
    status: input.failed ? "failed" : "completed",
    eventType: input.failed ? "failed" : "completed",
    summary: input.failed
      ? `Owner-directed article failed: ${input.error ?? "generation stopped"}`
      : "Completed the owner-directed article.",
    outcomeRef: input.articleId ? `article:${input.articleId}` : null,
  });
}
