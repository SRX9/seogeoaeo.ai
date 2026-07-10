import { and, desc, eq, ne } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentActionLedger,
  agentApprovals,
  agentEvents,
  agentTasks,
} from "@/lib/db/schema";

export type AgentEventType =
  | "planned"
  | "started"
  | "progressed"
  | "artifact_created"
  | "approval_requested"
  | "applied"
  | "verified"
  | "regressed"
  | "blocked"
  | "replanned"
  | "completed"
  | "failed";

export async function appendAgentEvent(
  scope: BrandScope,
  input: {
    missionId?: string | null;
    taskId?: string | null;
    eventType: AgentEventType;
    summary: string;
    data?: Record<string, unknown> | null;
    actor?: string;
  },
) {
  const [event] = await getDb()
    .insert(agentEvents)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      missionId: input.missionId ?? null,
      taskId: input.taskId ?? null,
      eventType: input.eventType,
      summary: input.summary,
      data: input.data ?? null,
      actor: input.actor ?? "claudia",
    })
    .returning();
  if (!event) throw new Error("Agent event could not be recorded");
  return event;
}

export async function transitionAgentTask(
  scope: BrandScope,
  taskId: string,
  input: {
    status: string;
    eventType: AgentEventType;
    summary: string;
    artifactRef?: string | null;
    outcomeRef?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const now = new Date();
  const [task] = await getDb()
    .update(agentTasks)
    .set({
      status: input.status,
      attempt: input.eventType === "started" ? 1 : undefined,
      startedAt: input.eventType === "started" ? now : undefined,
      completedAt:
        input.status === "completed" || input.status === "failed" ? now : undefined,
      artifactRef: input.artifactRef,
      outcomeRef: input.outcomeRef,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentTasks.id, taskId),
        eq(agentTasks.brandId, scope.brandId),
        ne(agentTasks.status, input.status),
      ),
    )
    .returning();

  if (!task) {
    return getDb().query.agentTasks.findFirst({
      where: and(eq(agentTasks.id, taskId), eq(agentTasks.brandId, scope.brandId)),
    });
  }

  await appendAgentEvent(scope, {
    missionId: task.missionId,
    taskId: task.id,
    eventType: input.eventType,
    summary: input.summary,
    data: input.data,
  });
  return task;
}

export async function recordTaskProgress(
  scope: BrandScope,
  taskId: string,
  summary: string,
  data?: Record<string, unknown>,
) {
  const task = await getDb().query.agentTasks.findFirst({
    where: and(eq(agentTasks.id, taskId), eq(agentTasks.brandId, scope.brandId)),
    columns: { id: true, missionId: true },
  });
  if (!task) return null;
  await getDb()
    .update(agentTasks)
    .set({ updatedAt: new Date() })
    .where(eq(agentTasks.id, task.id));
  return appendAgentEvent(scope, {
    missionId: task.missionId,
    taskId: task.id,
    eventType: "progressed",
    summary,
    data,
  });
}

export async function createAgentApproval(
  scope: BrandScope,
  input: {
    taskId?: string | null;
    actionType: string;
    resourceRef: string;
    beforeState?: unknown;
    afterState: unknown;
    riskLevel: string;
    expectedBenefit: string;
    expiresAt?: Date | null;
  },
) {
  const [approval] = await getDb()
    .insert(agentApprovals)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      taskId: input.taskId ?? null,
      actionType: input.actionType,
      resourceRef: input.resourceRef,
      beforeState: input.beforeState,
      afterState: input.afterState,
      riskLevel: input.riskLevel,
      expectedBenefit: input.expectedBenefit,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  if (!approval) throw new Error("Approval could not be created");
  await appendAgentEvent(scope, {
    taskId: approval.taskId,
    eventType: "approval_requested",
    summary: `Owner approval requested for ${input.actionType}.`,
    data: { approvalId: approval.id, resourceRef: input.resourceRef },
  });
  return approval;
}

export async function decideAgentApproval(
  scope: BrandScope,
  approvalId: string,
  decision: "approved" | "rejected" | "deferred",
  actor: string,
) {
  const [approval] = await getDb()
    .update(agentApprovals)
    .set({ status: decision, decidedBy: actor, decidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(agentApprovals.id, approvalId), eq(agentApprovals.brandId, scope.brandId)))
    .returning();
  if (!approval) return null;
  await appendAgentEvent(scope, {
    taskId: approval.taskId,
    eventType: decision === "approved" ? "progressed" : "blocked",
    summary: `Owner ${decision} ${approval.actionType}.`,
    data: { approvalId: approval.id, decision },
    actor,
  });
  return approval;
}

export async function listPendingAgentApprovals(brandId: string) {
  return getDb()
    .select()
    .from(agentApprovals)
    .where(and(eq(agentApprovals.brandId, brandId), eq(agentApprovals.status, "pending")))
    .orderBy(desc(agentApprovals.createdAt));
}

export async function recordAgentAction(
  scope: BrandScope,
  input: {
    taskId?: string | null;
    approvalId?: string | null;
    actionType: string;
    resourceRef: string;
    capability: string;
    idempotencyKey: string;
    beforeState?: unknown;
    appliedChange: unknown;
    remoteRef?: string | null;
    rollbackHandle?: Record<string, unknown> | null;
    verificationStatus?: "pending" | "verified" | "failed";
    verificationResult?: Record<string, unknown> | null;
  },
) {
  const db = getDb();
  const verified = input.verificationStatus === "verified";
  const [action] = await db
    .insert(agentActionLedger)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      taskId: input.taskId ?? null,
      approvalId: input.approvalId ?? null,
      actionType: input.actionType,
      resourceRef: input.resourceRef,
      capability: input.capability,
      idempotencyKey: input.idempotencyKey,
      beforeState: input.beforeState,
      appliedChange: input.appliedChange,
      remoteRef: input.remoteRef ?? null,
      rollbackHandle: input.rollbackHandle ?? null,
      verificationStatus: input.verificationStatus ?? "pending",
      verificationResult: input.verificationResult ?? null,
      verifiedAt: verified ? new Date() : null,
    })
    .onConflictDoNothing({
      target: [agentActionLedger.brandId, agentActionLedger.idempotencyKey],
    })
    .returning();

  if (!action) {
    const existing = await db.query.agentActionLedger.findFirst({
      where: and(
        eq(agentActionLedger.brandId, scope.brandId),
        eq(agentActionLedger.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (!existing) throw new Error("Action ledger entry could not be recorded");
    return existing;
  }

  await appendAgentEvent(scope, {
    taskId: action.taskId,
    eventType: verified ? "verified" : "applied",
    summary: verified
      ? `Verified ${input.actionType} on ${input.resourceRef}.`
      : `Applied ${input.actionType} to ${input.resourceRef}.`,
    data: { actionId: action.id, remoteRef: action.remoteRef },
  });
  return action;
}
