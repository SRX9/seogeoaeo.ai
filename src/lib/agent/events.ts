import { and, desc, eq, gt, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentActionLedger,
  agentApprovals,
  agentEvents,
  agentTasks,
} from "@/lib/db/schema";
import {
  computeActionProposalHash,
  DEFAULT_ACTION_POLICY_VERSION,
  type ActionProposalMaterial,
} from "@/lib/agent/proposal";

export type AgentEventType =
  | "planned"
  | "started"
  | "progressed"
  | "artifact_created"
  | "approval_requested"
  | "applied"
  | "verified"
  | "reverted"
  | "rollback_failed"
  | "regressed"
  | "blocked"
  | "objective_updated"
  | "plan_approved"
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
    fromStatuses: string[];
    status: string;
    eventType: AgentEventType;
    summary: string;
    artifactRef?: string | null;
    outcomeRef?: string | null;
    data?: Record<string, unknown>;
  },
) {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [task] = await tx
      .update(agentTasks)
      .set({
        status: input.status,
        attempt:
          input.eventType === "started" ? sql`${agentTasks.attempt} + 1` : undefined,
        startedAt: input.eventType === "started" ? now : undefined,
        completedAt:
          input.eventType === "started"
            ? null
            : input.status === "completed" || input.status === "failed"
              ? now
              : undefined,
        artifactRef: input.artifactRef,
        outcomeRef: input.outcomeRef,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentTasks.id, taskId),
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          inArray(agentTasks.status, input.fromStatuses),
          ne(agentTasks.status, input.status),
        ),
      )
      .returning();

    if (!task) {
      const [existing] = await tx
        .select()
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.id, taskId),
            eq(agentTasks.workspaceId, scope.workspaceId),
            eq(agentTasks.brandId, scope.brandId),
          ),
        )
        .limit(1);
      return existing;
    }

    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: task.missionId,
        taskId: task.id,
        eventType: input.eventType,
        summary: input.summary,
        data: input.data ?? null,
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Agent task event could not be recorded");
    return task;
  });
}

export async function recordTaskProgress(
  scope: BrandScope,
  taskId: string,
  summary: string,
  data?: Record<string, unknown>,
) {
  return getDb().transaction(async (tx) => {
    const [task] = await tx
      .update(agentTasks)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(agentTasks.id, taskId),
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.status, "in_progress"),
        ),
      )
      .returning({ id: agentTasks.id, missionId: agentTasks.missionId });
    if (!task) return null;
    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        missionId: task.missionId,
        taskId: task.id,
        eventType: "progressed",
        summary,
        data: data ?? null,
      })
      .returning();
    if (!event) throw new Error("Agent progress event could not be recorded");
    return event;
  });
}

export async function createAgentApproval(
  scope: BrandScope,
  input: {
    taskId?: string | null;
    actionType: string;
    capability?: string;
    resourceRef: string;
    destination?: string | null;
    beforeState?: unknown;
    afterState: unknown;
    modelPromptVersion?: string | null;
    policyVersion?: string;
    riskLevel: string;
    expectedBenefit: string;
    expiresAt?: Date | null;
  },
) {
  const now = new Date();
  const policyVersion = input.policyVersion ?? DEFAULT_ACTION_POLICY_VERSION;
  const capability = input.capability ?? input.actionType;
  const proposalHash = await computeActionProposalHash({
    actionType: input.actionType,
    capability,
    resourceRef: input.resourceRef,
    beforeState: input.beforeState,
    afterState: input.afterState,
    destination: input.destination,
    modelPromptVersion: input.modelPromptVersion,
    policyVersion,
  });

  return getDb().transaction(async (tx) => {
    await tx
      .update(agentApprovals)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(agentApprovals.brandId, scope.brandId),
          eq(agentApprovals.proposalHash, proposalHash),
          eq(agentApprovals.status, "pending"),
          lte(agentApprovals.expiresAt, now),
        ),
      );
    const [approval] = await tx
      .insert(agentApprovals)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        taskId: input.taskId ?? null,
        actionType: input.actionType,
        capability,
        resourceRef: input.resourceRef,
        destination: input.destination ?? null,
        beforeState: input.beforeState,
        afterState: input.afterState,
        proposalHash,
        policyVersion,
        modelPromptVersion: input.modelPromptVersion ?? null,
        riskLevel: input.riskLevel,
        expectedBenefit: input.expectedBenefit,
        expiresAt: input.expiresAt ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!approval) {
      const [existing] = await tx
        .select()
        .from(agentApprovals)
        .where(
          and(
            eq(agentApprovals.brandId, scope.brandId),
            eq(agentApprovals.proposalHash, proposalHash),
            eq(agentApprovals.status, "pending"),
            isNull(agentApprovals.invalidatedAt),
            or(isNull(agentApprovals.expiresAt), gt(agentApprovals.expiresAt, now)),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Approval could not be created");
      return existing;
    }
    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        taskId: approval.taskId,
        eventType: "approval_requested",
        summary: `Owner approval requested for ${input.actionType}.`,
        data: { approvalId: approval.id, resourceRef: input.resourceRef, proposalHash },
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Approval event could not be recorded");
    return approval;
  });
}

export async function decideAgentApproval(
  scope: BrandScope,
  approvalId: string,
  decision: "approved" | "rejected" | "deferred",
  actor: string,
) {
  const now = new Date();
  const approval = await getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(agentApprovals)
      .set({ status: decision, decidedBy: actor, decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(agentApprovals.id, approvalId),
          eq(agentApprovals.brandId, scope.brandId),
          eq(agentApprovals.status, "pending"),
          isNull(agentApprovals.invalidatedAt),
          or(isNull(agentApprovals.expiresAt), gt(agentApprovals.expiresAt, now)),
        ),
      )
      .returning();
    if (!updated) return null;
    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        taskId: updated.taskId,
        eventType: decision === "approved" ? "progressed" : "blocked",
        summary: `Owner ${decision} ${updated.actionType}.`,
        data: { approvalId: updated.id, decision },
        actor,
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Approval decision event could not be recorded");
    return updated;
  });
  if (!approval) {
    const existing = await getDb().query.agentApprovals.findFirst({
      where: and(
        eq(agentApprovals.id, approvalId),
        eq(agentApprovals.brandId, scope.brandId),
      ),
    });
    if (!existing) return null;
    return {
      approval: existing,
      changed: false,
      expired: existing.expiresAt != null && existing.expiresAt.getTime() <= now.getTime(),
    };
  }
  return { approval, changed: true, expired: false };
}

export async function listPendingAgentApprovals(brandId: string, now = new Date()) {
  return getDb()
    .select()
    .from(agentApprovals)
    .where(
      and(
        eq(agentApprovals.brandId, brandId),
        eq(agentApprovals.status, "pending"),
        isNull(agentApprovals.invalidatedAt),
        or(isNull(agentApprovals.expiresAt), gt(agentApprovals.expiresAt, now)),
      ),
    )
    .orderBy(desc(agentApprovals.createdAt));
}

export type ApprovalValidationResult =
  | { valid: true; approval: typeof agentApprovals.$inferSelect; proposalHash: string }
  | { valid: false; reason: string; proposalHash: string };

/** Re-hash material at the executor boundary and reject stale or reused approval. */
export async function validateAgentApprovalForExecution(
  scope: BrandScope,
  approvalId: string,
  material: ActionProposalMaterial,
  now = new Date(),
): Promise<ApprovalValidationResult> {
  const proposalHash = await computeActionProposalHash(material);
  const [approval] = await getDb()
    .select()
    .from(agentApprovals)
    .where(
      and(
        eq(agentApprovals.id, approvalId),
        eq(agentApprovals.workspaceId, scope.workspaceId),
        eq(agentApprovals.brandId, scope.brandId),
      ),
    )
    .limit(1);
  if (!approval) return { valid: false, reason: "Approval not found.", proposalHash };

  if (approval.proposalHash !== proposalHash) {
    if (!approval.invalidatedAt) {
      await getDb()
        .update(agentApprovals)
        .set({
          status: "invalidated",
          invalidatedAt: now,
          invalidationReason: "Material action fields changed after approval.",
          updatedAt: now,
        })
        .where(
          and(
            eq(agentApprovals.id, approval.id),
            isNull(agentApprovals.invalidatedAt),
          ),
        );
    }
    return {
      valid: false,
      reason: "Approval is stale because the proposed action changed.",
      proposalHash,
    };
  }
  if (approval.invalidatedAt || approval.status !== "approved") {
    return { valid: false, reason: "Approval is not active and approved.", proposalHash };
  }
  if (approval.expiresAt && approval.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, reason: "Approval has expired.", proposalHash };
  }
  return { valid: true, approval, proposalHash };
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
  return db.transaction(async (tx) => {
    const [action] = await tx
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
      const [existing] = await tx
        .select()
        .from(agentActionLedger)
        .where(
          and(
            eq(agentActionLedger.brandId, scope.brandId),
            eq(agentActionLedger.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Action ledger entry could not be recorded");
      return existing;
    }

    const [event] = await tx
      .insert(agentEvents)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        taskId: action.taskId,
        eventType: verified ? "verified" : "applied",
        summary: verified
          ? `Verified ${input.actionType} on ${input.resourceRef}.`
          : `Applied ${input.actionType} to ${input.resourceRef}.`,
        data: { actionId: action.id, remoteRef: action.remoteRef },
      })
      .returning({ id: agentEvents.id });
    if (!event) throw new Error("Action event could not be recorded");
    return action;
  });
}

/** Mirror a real remote compensation outcome onto the immutable action trail. */
export async function recordAgentActionRollback(
  scope: BrandScope,
  actionId: string,
  input: {
    status: "reverted" | "rollback_failed" | "manual_recovery_required";
    summary: string;
    data?: Record<string, unknown>;
  },
) {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [action] = await tx
      .update(agentActionLedger)
      .set({
        status: input.status,
        revertedAt: input.status === "reverted" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentActionLedger.id, actionId),
          eq(agentActionLedger.workspaceId, scope.workspaceId),
          eq(agentActionLedger.brandId, scope.brandId),
        ),
      )
      .returning();
    if (!action) return null;
    await tx.insert(agentEvents).values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      taskId: action.taskId,
      eventType:
        input.status === "reverted" ? "reverted" : "rollback_failed",
      summary: input.summary,
      data: { actionId: action.id, status: input.status, ...input.data },
    });
    return action;
  });
}
