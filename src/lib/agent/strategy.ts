import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import { agentEvents, agentPlanVersions, agentTasks } from "@/lib/db/schema";
import { ensureWeeklyPlan } from "@/lib/agent/planner";

const REVIEWABLE_TASK_STATUSES = ["planned", "scheduled", "waiting"];
const MAX_REVIEW_TASKS = 50;

export class StrategyReviewError extends Error {
  constructor(
    public readonly status: 400 | 409,
    message: string,
  ) {
    super(message);
    this.name = "StrategyReviewError";
  }
}

export type StrategyTask = {
  id: string;
  title: string;
  reason: string;
  taskType: string;
  status: string;
  expectedImpact: string | null;
  confidence: number;
  riskLevel: string;
  requiredAuthority: string;
  dependencies: string[];
  stopConditions: string[];
  scheduledFor: string | null;
};

export type StrategyReview = {
  missionId: string;
  plan: {
    id: string;
    version: number;
    rationale: string;
    windowStart: string;
    windowEnd: string;
    approvedAt: string | null;
    orderedTaskIds: string[];
  };
  tasks: StrategyTask[];
};

function stringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, max);
}

function stopConditions(input: Record<string, unknown> | null): string[] {
  return stringArray(input?.stopConditions);
}

/**
 * Stable plan-order contract shared by strategy, state, Ask, and executors.
 * Unknown or duplicated ids are ignored; callers retain their existing order
 * for tasks that were added after the explicit owner ordering was recorded.
 */
export function readPlanTaskOrder(
  evidence: Record<string, unknown> | null | undefined,
): string[] {
  const ids = stringArray(evidence?.orderedTaskIds, MAX_REVIEW_TASKS);
  return [...new Set(ids)];
}

export function orderTasksByPlan<T extends { id: string }>(
  tasks: readonly T[],
  evidence: Record<string, unknown> | null | undefined,
): T[] {
  const positions = new Map(
    readPlanTaskOrder(evidence).map((taskId, index) => [taskId, index]),
  );
  return tasks
    .map((task, originalIndex) => ({ task, originalIndex }))
    .toSorted((left, right) => {
      const leftPosition = positions.get(left.task.id);
      const rightPosition = positions.get(right.task.id);
      if (leftPosition == null && rightPosition == null) {
        return left.originalIndex - right.originalIndex;
      }
      if (leftPosition == null) return 1;
      if (rightPosition == null) return -1;
      return leftPosition - rightPosition;
    })
    .map(({ task }) => task);
}

function toStrategyTask(task: typeof agentTasks.$inferSelect): StrategyTask {
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
    dependencies: task.dependencies,
    stopConditions: stopConditions(task.input),
    scheduledFor: task.scheduledFor?.toISOString() ?? null,
  };
}

function ownerAuditMaterial(input: { reason: string; evidenceRefs: string[] }) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new StrategyReviewError(400, "Record a concise reason for this plan decision.");
  }
  if (
    input.evidenceRefs.length > 20 ||
    input.evidenceRefs.some((reference) => {
      const value = reference.trim();
      return value.length < 1 || value.length > 300;
    })
  ) {
    throw new StrategyReviewError(400, "Evidence references must be explicit and bounded.");
  }
  return {
    reason,
    evidenceRefs: [...new Set(input.evidenceRefs.map((reference) => reference.trim()))],
  };
}

function stalePlanError(): StrategyReviewError {
  return new StrategyReviewError(409, "The plan changed. Reload it before making this decision.");
}

/** Tenant-scoped strategy read model. Completed work remains in event history. */
export async function getStrategyReview(scope: BrandScope): Promise<StrategyReview> {
  const { mission, plan } = await ensureWeeklyPlan(scope);
  const db = getDb();
  const [tasks, approval] = await Promise.all([
    db
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.planVersionId, plan.id),
          inArray(agentTasks.status, REVIEWABLE_TASK_STATUSES),
        ),
      )
      .orderBy(asc(agentTasks.scheduledFor), asc(agentTasks.createdAt)),
    db
      .select({ createdAt: agentEvents.createdAt })
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.workspaceId, scope.workspaceId),
          eq(agentEvents.brandId, scope.brandId),
          eq(agentEvents.eventType, "plan_approved"),
          sql`${agentEvents.data}->>'planVersionId' = ${plan.id}`,
        ),
      )
      .orderBy(desc(agentEvents.createdAt))
      .limit(1),
  ]);
  const orderedTasks = orderTasksByPlan(tasks, plan.evidenceSnapshot);

  return {
    missionId: mission.id,
    plan: {
      id: plan.id,
      version: plan.version,
      rationale: plan.rationale,
      windowStart: plan.windowStart.toISOString(),
      windowEnd: plan.windowEnd.toISOString(),
      approvedAt: approval[0]?.createdAt.toISOString() ?? null,
      orderedTaskIds: orderedTasks.map((task) => task.id),
    },
    tasks: orderedTasks.map(toStrategyTask),
  };
}

export async function reorderStrategyTasks(
  scope: BrandScope,
  input: {
    expectedPlanId: string;
    taskIds: string[];
    reason: string;
    evidenceRefs: string[];
  },
) {
  const audit = ownerAuditMaterial(input);
  const requestedIds = [...new Set(input.taskIds)];
  if (requestedIds.length !== input.taskIds.length) {
    throw new StrategyReviewError(409, "Include every current future task exactly once.");
  }

  await getDb().transaction(async (tx) => {
    const [expectedPlan] = await tx
      .select()
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.id, input.expectedPlanId),
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
        ),
      )
      .for("update")
      .limit(1);
    if (!expectedPlan) throw stalePlanError();

    const [latestInWindow] = await tx
      .select({ id: agentPlanVersions.id })
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
          eq(agentPlanVersions.missionId, expectedPlan.missionId),
          eq(agentPlanVersions.windowStart, expectedPlan.windowStart),
        ),
      )
      .orderBy(desc(agentPlanVersions.version))
      .limit(1);
    if (latestInWindow?.id !== expectedPlan.id) throw stalePlanError();

    const currentTasks = await tx
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.planVersionId, expectedPlan.id),
          inArray(agentTasks.status, REVIEWABLE_TASK_STATUSES),
        ),
      )
      .orderBy(asc(agentTasks.scheduledFor), asc(agentTasks.createdAt))
      .for("update");
    const currentIds = currentTasks.map((task) => task.id).toSorted();
    if (
      requestedIds.length !== currentIds.length ||
      requestedIds.toSorted().some((taskId, index) => taskId !== currentIds[index])
    ) {
      throw new StrategyReviewError(
        409,
        "The future task set changed. Reload it, then include every task exactly once.",
      );
    }

    const [latestVersion] = await tx
      .select({ version: agentPlanVersions.version })
      .from(agentPlanVersions)
      .where(eq(agentPlanVersions.missionId, expectedPlan.missionId))
      .orderBy(desc(agentPlanVersions.version))
      .limit(1);
    const nextVersion = (latestVersion?.version ?? expectedPlan.version) + 1;
    const [plan] = await tx
      .insert(agentPlanVersions)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: expectedPlan.missionId,
        windowStart: expectedPlan.windowStart,
        windowEnd: expectedPlan.windowEnd,
        rationale: audit.reason,
        evidenceSnapshot: {
          ...expectedPlan.evidenceSnapshot,
          source: "owner_plan_review",
          operation: "reorder",
          ownerReason: audit.reason,
          orderedTaskIds: requestedIds,
          evidenceRefs: audit.evidenceRefs,
        },
        version: nextVersion,
        supersedesId: expectedPlan.id,
        replanReason: audit.reason,
      })
      .onConflictDoNothing({
        target: [agentPlanVersions.missionId, agentPlanVersions.version],
      })
      .returning();
    if (!plan) throw stalePlanError();

    const moved = await tx
      .update(agentTasks)
      .set({ planVersionId: plan.id, updatedAt: new Date() })
      .where(
        and(
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.planVersionId, expectedPlan.id),
          inArray(agentTasks.status, REVIEWABLE_TASK_STATUSES),
        ),
      )
      .returning({ id: agentTasks.id });
    if (moved.length !== currentTasks.length) throw stalePlanError();

    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: expectedPlan.missionId,
        eventType: "replanned",
        summary: `Owner reordered the future plan: ${audit.reason}`,
        data: {
          operation: "reorder",
          reason: audit.reason,
          evidenceRefs: audit.evidenceRefs,
          orderedTaskIds: requestedIds,
          fromPlanVersionId: expectedPlan.id,
          toPlanVersionId: plan.id,
          fromVersion: expectedPlan.version,
          toVersion: plan.version,
          movedTaskCount: moved.length,
        },
        actor: "owner",
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Owner plan-order event could not be recorded");
  });

  return getStrategyReview(scope);
}

export async function removeStrategyTask(
  scope: BrandScope,
  input: {
    expectedPlanId: string;
    taskId: string;
    reason: string;
    evidenceRefs: string[];
  },
) {
  const audit = ownerAuditMaterial(input);

  await getDb().transaction(async (tx) => {
    const [expectedPlan] = await tx
      .select()
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.id, input.expectedPlanId),
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
        ),
      )
      .for("update")
      .limit(1);
    if (!expectedPlan) throw stalePlanError();

    const [latestInWindow] = await tx
      .select({ id: agentPlanVersions.id })
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
          eq(agentPlanVersions.missionId, expectedPlan.missionId),
          eq(agentPlanVersions.windowStart, expectedPlan.windowStart),
        ),
      )
      .orderBy(desc(agentPlanVersions.version))
      .limit(1);
    if (latestInWindow?.id !== expectedPlan.id) throw stalePlanError();

    const currentTasks = await tx
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.planVersionId, expectedPlan.id),
          inArray(agentTasks.status, REVIEWABLE_TASK_STATUSES),
        ),
      )
      .orderBy(asc(agentTasks.scheduledFor), asc(agentTasks.createdAt))
      .for("update");
    const task = currentTasks.find((candidate) => candidate.id === input.taskId);
    if (!task) {
      throw new StrategyReviewError(
        409,
        "Only a future task from the reviewed plan can be removed. Reload the plan.",
      );
    }
    const orderedTaskIds = orderTasksByPlan(
      currentTasks,
      expectedPlan.evidenceSnapshot,
    )
      .filter((candidate) => candidate.id !== task.id)
      .map((candidate) => candidate.id);

    const [latestVersion] = await tx
      .select({ version: agentPlanVersions.version })
      .from(agentPlanVersions)
      .where(eq(agentPlanVersions.missionId, expectedPlan.missionId))
      .orderBy(desc(agentPlanVersions.version))
      .limit(1);
    const nextVersion = (latestVersion?.version ?? expectedPlan.version) + 1;
    const [plan] = await tx
      .insert(agentPlanVersions)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: expectedPlan.missionId,
        windowStart: expectedPlan.windowStart,
        windowEnd: expectedPlan.windowEnd,
        rationale: audit.reason,
        evidenceSnapshot: {
          ...expectedPlan.evidenceSnapshot,
          source: "owner_plan_review",
          operation: "remove",
          ownerReason: audit.reason,
          removedTaskId: task.id,
          orderedTaskIds,
          evidenceRefs: audit.evidenceRefs,
        },
        version: nextVersion,
        supersedesId: expectedPlan.id,
        replanReason: audit.reason,
      })
      .onConflictDoNothing({
        target: [agentPlanVersions.missionId, agentPlanVersions.version],
      })
      .returning();
    if (!plan) throw stalePlanError();

    const [cancelled] = await tx
      .update(agentTasks)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(agentTasks.id, task.id),
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.planVersionId, expectedPlan.id),
          inArray(agentTasks.status, REVIEWABLE_TASK_STATUSES),
        ),
      )
      .returning();
    if (!cancelled) throw stalePlanError();

    const moved = await tx
      .update(agentTasks)
      .set({ planVersionId: plan.id, updatedAt: new Date() })
      .where(
        and(
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.planVersionId, expectedPlan.id),
          inArray(agentTasks.status, REVIEWABLE_TASK_STATUSES),
        ),
      )
      .returning({ id: agentTasks.id });
    if (moved.length !== currentTasks.length - 1) throw stalePlanError();

    const events = await tx
      .insert(agentEvents)
      .values([
        {
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          missionId: expectedPlan.missionId,
          eventType: "replanned",
          summary: `Owner removed a future task: ${audit.reason}`,
          data: {
            operation: "remove",
            reason: audit.reason,
            evidenceRefs: audit.evidenceRefs,
            removedTaskId: task.id,
            orderedTaskIds,
            fromPlanVersionId: expectedPlan.id,
            toPlanVersionId: plan.id,
            fromVersion: expectedPlan.version,
            toVersion: plan.version,
            movedTaskCount: moved.length,
          },
          actor: "owner",
        },
        {
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          missionId: expectedPlan.missionId,
          taskId: task.id,
          eventType: "replanned",
          summary: `Owner removed from the future plan: ${task.title}`,
          data: {
            operation: "remove",
            reason: audit.reason,
            evidenceRefs: audit.evidenceRefs,
            fromPlanVersionId: expectedPlan.id,
            toPlanVersionId: plan.id,
          },
          actor: "owner",
        },
      ])
      .returning({ id: agentEvents.id });
    if (events.length !== 2) throw new Error("Owner task-removal events could not be recorded");
  });

  return getStrategyReview(scope);
}

export async function approveStrategy(
  scope: BrandScope,
  input: { planId: string; reason: string; evidenceRefs: string[] },
) {
  const audit = ownerAuditMaterial(input);

  await getDb().transaction(async (tx) => {
    const [plan] = await tx
      .select()
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.id, input.planId),
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
        ),
      )
      .for("update")
      .limit(1);
    if (!plan) throw stalePlanError();

    const [latestInWindow] = await tx
      .select({ id: agentPlanVersions.id })
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
          eq(agentPlanVersions.missionId, plan.missionId),
          eq(agentPlanVersions.windowStart, plan.windowStart),
        ),
      )
      .orderBy(desc(agentPlanVersions.version))
      .limit(1);
    if (latestInWindow?.id !== plan.id) throw stalePlanError();

    const [existingApproval] = await tx
      .select({ id: agentEvents.id })
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.workspaceId, scope.workspaceId),
          eq(agentEvents.brandId, scope.brandId),
          eq(agentEvents.eventType, "plan_approved"),
          sql`${agentEvents.data}->>'planVersionId' = ${plan.id}`,
        ),
      )
      .limit(1);
    if (existingApproval) return;

    const [inserted] = await tx
      .insert(agentEvents)
      .values({
        // Reusing the immutable plan UUID gives this one approval event a
        // deterministic database identity without adding a mutable ledger.
        id: plan.id,
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: plan.missionId,
        eventType: "plan_approved",
        summary: `Owner approved plan v${plan.version}: ${audit.reason}`,
        data: {
          planVersionId: plan.id,
          planVersion: plan.version,
          reason: audit.reason,
          evidenceRefs: audit.evidenceRefs,
        },
        actor: "owner",
      })
      .onConflictDoNothing({ target: agentEvents.id })
      .returning({ id: agentEvents.id });
    if (inserted) return;

    const [collision] = await tx
      .select({
        brandId: agentEvents.brandId,
        eventType: agentEvents.eventType,
        data: agentEvents.data,
      })
      .from(agentEvents)
      .where(eq(agentEvents.id, plan.id))
      .limit(1);
    if (
      collision?.brandId !== scope.brandId ||
      collision.eventType !== "plan_approved" ||
      collision.data?.planVersionId !== plan.id
    ) {
      throw new Error("Plan approval idempotency key collided with another event");
    }
  });

  return getStrategyReview(scope);
}
