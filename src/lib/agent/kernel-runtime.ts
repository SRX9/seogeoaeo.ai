import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { authorizeAgentAutonomyAction } from "@/lib/agent/autonomy-rollout";
import { isAutomaticPublishingMode } from "@/lib/workspace/settings";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentEvents,
  agentMissions,
  agentPlanVersions,
  agentTasks,
  brands,
} from "@/lib/db/schema";
import type {
  KernelAction,
  KernelExecutionBoundary,
} from "@/lib/agent/kernel";
import {
  getKernelPolicyRevision,
  getKernelRegistryRevision,
} from "@/lib/agent/kernel-receipt";
import { getAgentControlState, type AgentControlState } from "@/lib/agent/memory";
import { hasUnresolvedHighImpactMemoryContradiction } from "@/lib/agent/memory-corrections";
import { validateMemoryEvidenceRefsAtExecution } from "@/lib/agent/layered-memory";
import {
  authorizeAction,
  isArticleGenerationBlockedByOwnerConstraint,
  type AuthorityMode,
} from "@/lib/agent/policy";
import {
  canRunGoalKernel,
  getAgentSafetyDecision,
  type AgentOperation,
} from "@/lib/agent/safety";
import { orderTasksByPlan } from "@/lib/agent/strategy";
import { requireAgentTool } from "@/lib/agent/tool-registry";

const CLAIMABLE_STATUSES = ["planned", "scheduled"];
const DEFAULT_LEASE_MS = 5 * 60 * 1_000;

type KernelSafetyEnv = Parameters<typeof canRunGoalKernel>[0];
type KernelTask = typeof agentTasks.$inferSelect;

export type KernelTaskClaim = {
  task: KernelTask;
  planId: string;
  objectiveDefinitionVersion: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  attempt: number;
  recoveryRequired: boolean;
};

export type KernelTaskClaimResult =
  | { status: "claimed"; claim: KernelTaskClaim }
  | { status: "no_work" }
  | { status: "stale"; reason: string }
  | { status: "interrupted"; reason: string };

export function selectNextKernelTask<
  T extends {
    id: string;
    status: string;
    dependencies: readonly string[];
    scheduledFor: Date | null;
  },
>(
  tasks: readonly T[],
  evidence: Record<string, unknown> | null | undefined,
  completedTaskIds: ReadonlySet<string>,
  now: Date,
): T | null {
  // The query only supplies claimable rows, so an in-progress row here has an
  // expired lease. Resolve that uncertain prior side effect before fresh work.
  const recovery = tasks.filter((task) => task.status === "in_progress");
  const candidates = recovery.length > 0 ? recovery : tasks;
  return (
    orderTasksByPlan(candidates, evidence).find(
      (task) =>
        (task.scheduledFor == null || task.scheduledFor.getTime() <= now.getTime()) &&
        task.dependencies.every((dependencyId) => completedTaskIds.has(dependencyId)),
    ) ?? null
  );
}

function currentPolicyMaterial(mode: AuthorityMode, controls: AgentControlState) {
  return {
    mode,
    ownerConstraints: controls.ownerConstraints,
    grantedCapabilities: controls.grantedCapabilities,
    canonicalPolicies: controls.canonicalPolicies,
  };
}

function claimInterruption(
  controls: AgentControlState,
  env: KernelSafetyEnv,
): string | null {
  if (!canRunGoalKernel(env)) {
    return "The goal kernel is disabled by the current rollout or emergency-stop policy.";
  }
  const safety = getAgentSafetyDecision("observation", {
    actor: "agent",
    controls,
    env,
  });
  return safety.allowed ? null : safety.reason;
}

async function releaseInterruptedClaim(
  scope: BrandScope,
  claim: KernelTaskClaim,
  reason: string,
) {
  await getDb().transaction(async (tx) => {
    const [released] = await tx
      .update(agentTasks)
      .set({
        // A reclaimed task may already have produced an unknown side effect.
        // Keep it visibly unresolved and immediately reclaimable; converting it
        // to waiting would let a later resume treat the task as fresh work.
        status: claim.recoveryRequired ? "in_progress" : "waiting",
        leaseOwner: null,
        leaseExpiresAt: claim.recoveryRequired ? new Date(0) : null,
        heartbeatAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(agentTasks.id, claim.task.id),
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.status, "in_progress"),
          eq(agentTasks.leaseOwner, claim.leaseOwner),
          eq(agentTasks.attempt, claim.attempt),
        ),
      )
      .returning({ id: agentTasks.id, missionId: agentTasks.missionId });
    if (!released) return;
    await tx.insert(agentEvents).values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      missionId: released.missionId,
      taskId: released.id,
      eventType: "blocked",
      summary: `Goal-kernel claim released before execution: ${reason}`,
      data: {
        reason,
        leaseOwner: claim.leaseOwner,
        recoveryRequired: claim.recoveryRequired,
      },
      actor: "claudia",
    });
  });
}

/**
 * Claim exactly one due dynamic task in the owner's persisted order. Fixed
 * daily/setup workflows use different executor names and are never selected.
 */
export async function claimNextKernelTask(
  scope: BrandScope,
  input: {
    expectedPlanId: string;
    expectedObjectiveDefinitionVersion: number;
    leaseOwner: string;
    leaseMs?: number;
    now?: Date;
    env?: KernelSafetyEnv;
  },
): Promise<KernelTaskClaimResult> {
  const now = input.now ?? new Date();
  const leaseMs = Math.min(
    30 * 60 * 1_000,
    Math.max(30_000, input.leaseMs ?? DEFAULT_LEASE_MS),
  );
  const controls = await getAgentControlState(scope.brandId);
  const interrupted = claimInterruption(controls, input.env);
  if (interrupted) return { status: "interrupted", reason: interrupted };

  const result = await getDb().transaction(async (tx): Promise<KernelTaskClaimResult> => {
    const [candidatePlan] = await tx
      .select()
      .from(agentPlanVersions)
      .where(
        and(
          eq(agentPlanVersions.id, input.expectedPlanId),
          eq(agentPlanVersions.workspaceId, scope.workspaceId),
          eq(agentPlanVersions.brandId, scope.brandId),
        ),
      )
      .limit(1);
    if (!candidatePlan) {
      return { status: "stale", reason: "The expected plan no longer exists." };
    }

    // Objective reconfiguration also takes this mission lock before replacing
    // plan work, so every writer follows mission -> plan -> task lock order.
    const [objective] = await tx
      .select()
      .from(agentMissions)
      .where(
        and(
          eq(agentMissions.id, candidatePlan.missionId),
          eq(agentMissions.workspaceId, scope.workspaceId),
          eq(agentMissions.brandId, scope.brandId),
        ),
      )
      .for("update")
      .limit(1);
    if (
      !objective ||
      objective.status !== "active" ||
      objective.definitionVersion !== input.expectedObjectiveDefinitionVersion
    ) {
      return {
        status: "stale",
        reason: "The objective changed or stopped before the next task was claimed.",
      };
    }

    const [plan] = await tx
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
    if (!plan || plan.missionId !== objective.id) {
      return { status: "stale", reason: "The expected plan no longer matches the objective." };
    }

    const [latestPlan] = await tx
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
    if (latestPlan?.id !== plan.id) {
      return { status: "stale", reason: "The owner or planner replaced this plan." };
    }

    const expiredTasks = await tx
      .select()
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.missionId, objective.id),
          eq(agentTasks.executor, "goal-kernel"),
          eq(agentTasks.status, "in_progress"),
          lte(agentTasks.leaseExpiresAt, now),
        ),
      )
      .orderBy(asc(agentTasks.leaseExpiresAt), asc(agentTasks.createdAt))
      .for("update");

    let tasks: KernelTask[];
    let taskOrderEvidence: Record<string, unknown> = plan.evidenceSnapshot;
    if (expiredTasks.length > 0) {
      const recoveryPlanIds = [
        ...new Set(
          expiredTasks.flatMap((task) =>
            task.planVersionId ? [task.planVersionId] : [],
          ),
        ),
      ];
      const recoveryPlans = recoveryPlanIds.length
        ? await tx
            .select({
              id: agentPlanVersions.id,
              evidenceSnapshot: agentPlanVersions.evidenceSnapshot,
            })
            .from(agentPlanVersions)
            .where(inArray(agentPlanVersions.id, recoveryPlanIds))
            .orderBy(asc(agentPlanVersions.version))
        : [];
      const orderedRecovery = recoveryPlans.flatMap((recoveryPlan) =>
        orderTasksByPlan(
          expiredTasks.filter((task) => task.planVersionId === recoveryPlan.id),
          recoveryPlan.evidenceSnapshot,
        ),
      );
      const orderedIds = new Set(orderedRecovery.map((task) => task.id));
      tasks = [
        ...orderedRecovery,
        ...expiredTasks.filter((task) => !orderedIds.has(task.id)),
      ];
      taskOrderEvidence = { orderedTaskIds: tasks.map((task) => task.id) };
    } else {
      tasks = await tx
        .select()
        .from(agentTasks)
        .where(
          and(
            eq(agentTasks.workspaceId, scope.workspaceId),
            eq(agentTasks.brandId, scope.brandId),
            eq(agentTasks.planVersionId, plan.id),
            eq(agentTasks.executor, "goal-kernel"),
            inArray(agentTasks.status, CLAIMABLE_STATUSES),
            or(isNull(agentTasks.scheduledFor), lte(agentTasks.scheduledFor, now)),
          ),
        )
        .orderBy(asc(agentTasks.scheduledFor), asc(agentTasks.createdAt))
        .for("update");
    }
    if (tasks.length === 0) return { status: "no_work" };

    const completed = await tx
      .select({ id: agentTasks.id })
      .from(agentTasks)
      .where(
        and(
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.missionId, objective.id),
          eq(agentTasks.status, "completed"),
        ),
      );
    const selected = selectNextKernelTask(
      tasks,
      taskOrderEvidence,
      new Set(completed.map((task) => task.id)),
      now,
    );
    if (!selected) return { status: "no_work" };

    const recoveryRequired = selected.status === "in_progress";
    const claimedPlanId = selected.planVersionId ?? plan.id;
    const leaseExpiresAt = new Date(now.getTime() + leaseMs);
    const [claimed] = await tx
      .update(agentTasks)
      .set({
        status: "in_progress",
        startedAt: now,
        completedAt: null,
        attempt: sql`${agentTasks.attempt} + 1`,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt,
        heartbeatAt: now,
        originalExecutorId: sql`coalesce(${agentTasks.originalExecutorId}, ${input.leaseOwner})`,
        takeoverExecutorId: recoveryRequired ? input.leaseOwner : undefined,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentTasks.id, selected.id),
          eq(agentTasks.workspaceId, scope.workspaceId),
          eq(agentTasks.brandId, scope.brandId),
          eq(agentTasks.executor, "goal-kernel"),
          recoveryRequired
            ? and(
                eq(agentTasks.missionId, objective.id),
              eq(agentTasks.status, "in_progress"),
              lte(agentTasks.leaseExpiresAt, now),
              )
            : and(
                eq(agentTasks.planVersionId, plan.id),
                inArray(agentTasks.status, CLAIMABLE_STATUSES),
              ),
        ),
      )
      .returning();
    if (!claimed) {
      return { status: "stale", reason: "Another worker or owner changed the next task." };
    }

    await tx.insert(agentEvents).values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      missionId: claimed.missionId,
      taskId: claimed.id,
      eventType: "started",
      summary: `Goal kernel ${recoveryRequired ? "reclaimed" : "claimed"} the next owner-ordered task: ${claimed.title}`,
      data: {
        planVersionId: claimedPlanId,
        objectiveDefinitionVersion: objective.definitionVersion,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt: leaseExpiresAt.toISOString(),
        attempt: claimed.attempt,
        takeover: recoveryRequired,
      },
      actor: "claudia",
    });

    return {
      status: "claimed",
      claim: {
        task: claimed,
        planId: claimedPlanId,
        objectiveDefinitionVersion: objective.definitionVersion,
        leaseOwner: input.leaseOwner,
        leaseExpiresAt,
        attempt: claimed.attempt,
        recoveryRequired,
      },
    };
  });

  if (result.status !== "claimed") return result;
  const latestControls = await getAgentControlState(scope.brandId);
  const latestInterruption = claimInterruption(latestControls, input.env);
  if (!latestInterruption) return result;
  await releaseInterruptedClaim(scope, result.claim, latestInterruption);
  return { status: "interrupted", reason: latestInterruption };
}

function operationFor(action: KernelAction): AgentOperation {
  if (action.capability === "observe") return "observation";
  if (action.capability === "prepare") return "drafting";
  return action.effect === "remote_write" ? "publishing" : "site_write";
}

/**
 * Re-resolve every mutable authority input immediately before an initial act
 * or retry. The returned boundary is descriptive, not an authority cache.
 */
export async function resolveKernelExecutionBoundary(
  scope: BrandScope,
  input: {
    action: KernelAction;
    iteration: number;
    claim: KernelTaskClaim;
    env?: KernelSafetyEnv;
    now?: Date;
  },
): Promise<KernelExecutionBoundary> {
  const now = input.now ?? new Date();
  const [
    objective,
    controls,
    brand,
    task,
    plan,
    blockingMemoryConflict,
    memoryEvidence,
  ] = await Promise.all([
    getDb().query.agentMissions.findFirst({
      where: and(
        eq(agentMissions.id, input.action.objectiveId),
        eq(agentMissions.workspaceId, scope.workspaceId),
        eq(agentMissions.brandId, scope.brandId),
      ),
    }),
    getAgentControlState(scope.brandId),
    getDb().query.brands.findFirst({
      where: and(eq(brands.id, scope.brandId), eq(brands.workspaceId, scope.workspaceId)),
    }),
    getDb().query.agentTasks.findFirst({
      where: and(
        eq(agentTasks.id, input.claim.task.id),
        eq(agentTasks.workspaceId, scope.workspaceId),
        eq(agentTasks.brandId, scope.brandId),
      ),
    }),
    getDb().query.agentPlanVersions.findFirst({
      where: and(
        eq(agentPlanVersions.id, input.claim.planId),
        eq(agentPlanVersions.workspaceId, scope.workspaceId),
        eq(agentPlanVersions.brandId, scope.brandId),
      ),
    }),
    hasUnresolvedHighImpactMemoryContradiction(scope, now),
    validateMemoryEvidenceRefsAtExecution(scope, input.action.evidenceRefs, {
      consumer: "planner",
      now,
    }),
  ]);

  const interruption = claimInterruption(controls, input.env);
  if (interruption) return { status: "interrupted", reason: interruption };
  if (!objective || !brand || !task || !plan) {
    return { status: "stale", reason: "The task, plan, objective, or brand changed." };
  }
  if (
    task.status !== "in_progress" ||
    task.planVersionId !== plan.id ||
    task.leaseOwner !== input.claim.leaseOwner ||
    task.attempt !== input.claim.attempt ||
    !task.leaseExpiresAt ||
    task.leaseExpiresAt.getTime() <= now.getTime()
  ) {
    return { status: "interrupted", reason: "The dynamic task lease is no longer active." };
  }
  if (input.claim.recoveryRequired) {
    return {
      status: "denied",
      reason: "The reclaimed task has an unresolved prior side effect and must be observed before any new tool call.",
    };
  }
  if (
    objective.status !== "active" ||
    objective.id !== input.action.receipt.objectiveId ||
    objective.definitionVersion !== input.action.receipt.objectiveDefinitionVersion ||
    objective.definitionVersion !== input.claim.objectiveDefinitionVersion
  ) {
    return { status: "stale", reason: "The objective changed after this action was planned." };
  }
  if (blockingMemoryConflict) {
    return {
      status: "denied",
      reason: "A high-impact memory conflict requires an owner decision before dynamic execution.",
    };
  }
  if (!memoryEvidence.valid) {
    return {
      status: "stale",
      reason: `Planned memory evidence is no longer usable: ${memoryEvidence.reason}`,
    };
  }

  const mode: AuthorityMode = isAutomaticPublishingMode(brand.autonomyMode)
    ? "FULL_AUTO"
    : "REVIEW";
  const currentPolicyRevision = getKernelPolicyRevision(
    currentPolicyMaterial(mode, controls),
  );
  if (currentPolicyRevision !== input.action.receipt.policyRevision) {
    return { status: "stale", reason: "Owner policy changed after this action was planned." };
  }
  if (getKernelRegistryRevision() !== input.action.receipt.registryRevision) {
    return { status: "stale", reason: "Tool registry metadata changed after planning." };
  }

  let tool;
  try {
    tool = requireAgentTool(input.action.tool.name, input.action.tool.version, "agent_loop");
  } catch (error) {
    return {
      status: "stale",
      reason: error instanceof Error ? error.message : "The planned tool is unavailable.",
    };
  }
  const parsedInput = tool.inputSchema.safeParse(input.action.input);
  const capability = tool.capability.mode === "static" ? tool.capability.value : null;
  if (
    !parsedInput.success ||
    capability == null ||
    capability !== input.action.capability ||
    tool.effect !== input.action.effect ||
    tool.riskClass !== input.action.risk
  ) {
    return { status: "stale", reason: "Current tool metadata no longer matches the planned action." };
  }
  if (!objective.allowedCapabilities.includes(capability)) {
    return { status: "denied", reason: "The current objective no longer allows this capability." };
  }
  if (
    capability === "prepare" &&
    controls.ownerConstraints.some((constraint) =>
      isArticleGenerationBlockedByOwnerConstraint(constraint, input.action.resourceRef),
    )
  ) {
    return { status: "denied", reason: "A current owner constraint blocks this preparation." };
  }

  const safety = getAgentSafetyDecision(operationFor(input.action), {
    actor: "agent",
    controls,
    env: input.env,
  });
  if (!safety.allowed) return { status: "interrupted", reason: safety.reason };
  if (input.action.estimatedCost.credits > 0) {
    const billable = getAgentSafetyDecision("billable", {
      actor: "agent",
      controls,
      env: input.env,
    });
    if (!billable.allowed) return { status: "interrupted", reason: billable.reason };
  }

  const authority = authorizeAction({
    mode,
    capability,
    riskLevel: tool.riskClass,
    resourceRef: input.action.resourceRef,
    ownerConstraints: controls.ownerConstraints,
    grantedCapabilities: controls.grantedCapabilities,
    canonicalPolicies: controls.canonicalPolicies,
    destination: input.action.destination ?? null,
    categories: input.action.categories,
  });
  if (authority.decision !== "allow") {
    return {
      status: "denied",
      reason: `Current policy requires a fresh plan decision: ${authority.reason}`,
    };
  }

  const proposalHash = createHash("sha256")
    .update(
      JSON.stringify([
        input.action.candidateId,
        input.action.receipt,
        input.action.tool,
        input.action.capability,
        input.action.resourceRef,
        input.action.input,
      ]),
    )
    .digest("hex");
  const autonomy = await authorizeAgentAutonomyAction(scope, {
    taskId: task.id,
    capability,
    effect: tool.effect,
    risk: tool.riskClass,
    resourceRef: input.action.resourceRef,
    destination: input.action.destination ?? null,
    proposalHash,
    approvalValidated: false,
    certificationValidated: tool.effect !== "remote_write",
    certificationId: null,
    reversible: tool.rollback.mode !== "none",
    estimatedCredits: input.action.estimatedCost.credits,
    estimatedMoneyMicros: input.action.estimatedCost.moneyMicros,
    resourceCount: 1,
    scheduledObservation: input.action.family === "observe",
    baselineDecision: {
      workflow: "static_workflow",
      family: input.action.family,
      tool: input.action.tool,
    },
    now,
  });
  if (autonomy.policy.decision === "shadow") {
    return {
      status: "shadow",
      reason: autonomy.policy.reason,
      decisionId: autonomy.decision.id,
    };
  }
  if (autonomy.policy.decision === "pause") {
    return { status: "interrupted", reason: autonomy.policy.reason };
  }
  if (autonomy.policy.decision !== "allow") {
    return { status: "denied", reason: autonomy.policy.reason };
  }

  return {
    status: "authorized",
    checkedAt: now.toISOString(),
    iteration: input.iteration,
    candidateId: input.action.candidateId,
    tool: input.action.tool,
    receipt: input.action.receipt,
  };
}
