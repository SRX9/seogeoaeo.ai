import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentAutonomyDecisions,
  agentAutonomyRollouts,
  agentAutonomyRolloutEvents,
  agentBehaviorReleases,
  type AutonomyRiskBudget,
  type AutonomyStopConditions,
} from "@/lib/db/schema";
import type { ToolEffect, ToolRiskClass } from "@/lib/agent/tool-registry";
import { listOperationalIncidents } from "@/lib/observability/slos";
import { logError, logInfo } from "@/lib/logging/logger";

export const AUTONOMY_LEVELS = [0, 1, 2, 3, 4] as const;
export const ROLLOUT_STAGES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const AUTONOMY_ROLLOUT_POLICY_VERSION = "claudia-autonomy-rollout-v1";

export const autonomyRiskBudgetSchema = z
  .object({
    maxActionsPerUtcDay: z.number().int().positive().max(1_000),
    maxCreditsPerUtcDay: z.number().int().nonnegative(),
    maxMoneyMicrosPerUtcDay: z.number().int().nonnegative(),
    maxResourcesPerAction: z.number().int().positive().max(100),
    destinations: z.array(z.string().min(1).max(100)).min(1).max(16),
    allowedUtcHours: z.array(z.number().int().min(0).max(23)).min(1).max(24),
  })
  .strict();

export const autonomyStopConditionsSchema = z
  .object({
    pauseOnAnyCriticalIncident: z.boolean(),
    sloKeys: z.array(z.string().min(1)).min(1).max(32),
    maxVerificationFailureRate: z.number().min(0).max(1),
    maxRollbackFailureRate: z.number().min(0).max(1),
    maxBusinessHarmPercent: z.number().min(0).max(100),
  })
  .strict();

export const autonomyRolloutDefinitionSchema = z
  .object({
    capability: z.string().min(1),
    provider: z.string().min(1).nullable(),
    certificationId: z.string().uuid().nullable(),
    releaseId: z.string().uuid().nullable(),
    cohortKey: z.string().min(1).max(100),
    cohortPercent: z.number().int().min(0).max(100),
    autonomyLevel: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
    rolloutStage: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
    ]),
    executionMode: z.enum(["eval", "synthetic", "internal", "shadow", "live"]),
    strategyRef: z.string().min(1).nullable(),
    riskBudget: autonomyRiskBudgetSchema,
    stopConditions: autonomyStopConditionsSchema,
    minimumSampleSize: z.number().int().positive(),
    observationWindowStartsAt: z.coerce.date(),
    observationWindowEndsAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.observationWindowEndsAt <= value.observationWindowStartsAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["observationWindowEndsAt"],
        message: "Observation window must end after it starts.",
      });
    }
    if (value.rolloutStage === 4 && value.executionMode !== "shadow") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["executionMode"],
        message: "Real-brand shadow stage cannot execute live actions.",
      });
    }
    if (
      value.autonomyLevel === 4 &&
      (!value.certificationId || !value.releaseId || !value.strategyRef)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["autonomyLevel"],
        message: "Level 4 requires certification, release, and strategy evidence.",
      });
    }
  });

export type AutonomyDecision =
  | "allow"
  | "shadow"
  | "approval_required"
  | "deny"
  | "pause";

type RolloutRow = typeof agentAutonomyRollouts.$inferSelect;

const STAGE_MODE = {
  1: "eval",
  2: "synthetic",
  3: "internal",
  4: "shadow",
  5: "live",
  6: "live",
  7: "live",
  8: "live",
} as const;

const STAGE_LEVEL_CEILING = { 1: 1, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4 } as const;

export function assessRolloutTransition(
  current: Pick<
    RolloutRow,
    | "status"
    | "rolloutStage"
    | "autonomyLevel"
    | "cohortPercent"
    | "executionMode"
    | "certificationId"
    | "releaseId"
    | "strategyRef"
  >,
  next: {
    status: "active" | "paused" | "completed" | "rolled_back";
    rolloutStage: number;
    autonomyLevel: number;
    cohortPercent: number;
    executionMode: string;
  },
) {
  if (!["draft", "active", "paused"].includes(current.status)) {
    return { allowed: false as const, reason: `Cannot expand a ${current.status} rollout.` };
  }
  const changesAuthority =
    next.rolloutStage !== current.rolloutStage ||
    next.autonomyLevel !== current.autonomyLevel ||
    next.cohortPercent !== current.cohortPercent ||
    next.executionMode !== current.executionMode;
  const isAdministrativeTransition =
    next.status === "paused" || next.status === "completed" || next.status === "rolled_back";

  if (isAdministrativeTransition) {
    if (changesAuthority) {
      return {
        allowed: false as const,
        reason: "Pausing or closing a rollout cannot also change its authority.",
      };
    }
    if (next.status === "completed" && current.status !== "active") {
      return { allowed: false as const, reason: "Only an active rollout can be completed." };
    }
    if (current.status === "draft" && next.status !== "rolled_back") {
      return { allowed: false as const, reason: "A draft rollout can only be activated or rolled back." };
    }
    if (current.status === "paused" && next.status !== "rolled_back") {
      return { allowed: false as const, reason: "A paused rollout can only be resumed or rolled back." };
    }
    return { allowed: true as const };
  }
  if (current.status === "draft" || current.status === "paused") {
    if (changesAuthority) {
      return {
        allowed: false as const,
        reason: "Activation and resumption must preserve the last reviewed authority boundary.",
      };
    }
    return { allowed: true as const };
  }
  if (
    next.rolloutStage < current.rolloutStage ||
    next.rolloutStage > current.rolloutStage + 1
  ) {
    return { allowed: false as const, reason: "Rollout stages cannot be skipped or reversed." };
  }
  if (
    next.autonomyLevel < current.autonomyLevel ||
    next.autonomyLevel > current.autonomyLevel + 1
  ) {
    return { allowed: false as const, reason: "Autonomy levels must expand one level at a time." };
  }
  const stage = next.rolloutStage as keyof typeof STAGE_MODE;
  if (!STAGE_MODE[stage] || next.executionMode !== STAGE_MODE[stage]) {
    return { allowed: false as const, reason: "Execution mode does not match the rollout stage." };
  }
  if (next.autonomyLevel > STAGE_LEVEL_CEILING[stage]) {
    return { allowed: false as const, reason: "Autonomy level exceeds the rollout-stage ceiling." };
  }
  if (next.cohortPercent < current.cohortPercent || next.cohortPercent > 100) {
    return { allowed: false as const, reason: "Cohort expansion must be monotonic and bounded." };
  }
  if (
    next.rolloutStage === 7 &&
    next.cohortPercent > current.cohortPercent + 10
  ) {
    return { allowed: false as const, reason: "Percentage canaries expand by at most ten points." };
  }
  if (next.rolloutStage === 8 && next.cohortPercent !== 100) {
    return { allowed: false as const, reason: "Certified GA requires the full selected cohort." };
  }
  if (
    next.autonomyLevel >= 3 &&
    (!current.certificationId || !current.releaseId || !current.strategyRef)
  ) {
    return {
      allowed: false as const,
      reason: "Delegated authority requires certification, release, and strategy evidence.",
    };
  }
  return { allowed: true as const };
}

/** Trusted operator primitive; intentionally not exposed through a promotion route. */
export async function createSelectedAutonomyRollout(
  scope: BrandScope,
  rawDefinition: unknown,
  audit: { owner: string; reason: string; evidenceRefs: string[] },
) {
  const definition = autonomyRolloutDefinitionSchema.parse(rawDefinition);
  if (audit.evidenceRefs.length === 0) throw new Error("Rollout selection requires evidence");
  if (
    definition.rolloutStage !== 1 ||
    definition.autonomyLevel !== 0 ||
    definition.executionMode !== "eval" ||
    definition.cohortPercent !== 0
  ) {
    throw new Error("New autonomy rollouts must start at Stage 1, Level 0, and zero cohort");
  }
  return getDb().transaction(async (tx) => {
    const [rollout] = await tx
      .insert(agentAutonomyRollouts)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        ...definition,
        status: "draft",
        owner: audit.owner,
      })
      .returning();
    if (!rollout) throw new Error("Autonomy rollout could not be selected");
    await tx.insert(agentAutonomyRolloutEvents).values({
      rolloutId: rollout.id,
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      eventType: "selected",
      toStatus: rollout.status,
      toStage: rollout.rolloutStage,
      toLevel: rollout.autonomyLevel,
      toCohortPercent: rollout.cohortPercent,
      reason: audit.reason,
      evidenceRefs: audit.evidenceRefs,
      owner: audit.owner,
    });
    return rollout;
  });
}

/** Trusted operator transition with monotonic stage, level, and cohort bounds. */
export async function transitionAutonomyRollout(
  scope: BrandScope,
  rolloutId: string,
  input: {
    expectedRevision: number;
    status: "active" | "paused" | "completed" | "rolled_back";
    rolloutStage: number;
    autonomyLevel: number;
    cohortPercent: number;
    executionMode: "eval" | "synthetic" | "internal" | "shadow" | "live";
    owner: string;
    reason: string;
    evidenceRefs: string[];
  },
) {
  if (input.evidenceRefs.length === 0) throw new Error("Rollout transition requires evidence");
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(agentAutonomyRollouts)
      .where(
        and(
          eq(agentAutonomyRollouts.id, rolloutId),
          eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
          eq(agentAutonomyRollouts.brandId, scope.brandId),
          eq(agentAutonomyRollouts.revision, input.expectedRevision),
        ),
      )
      .for("update")
      .limit(1);
    if (!current) throw new Error("Autonomy rollout changed concurrently");
    const assessment = assessRolloutTransition(current, input);
    if (!assessment.allowed) throw new Error(assessment.reason);
    const now = new Date();
    const [updated] = await tx
      .update(agentAutonomyRollouts)
      .set({
        status: input.status,
        rolloutStage: input.rolloutStage,
        autonomyLevel: input.autonomyLevel,
        cohortPercent: input.cohortPercent,
        executionMode: input.executionMode,
        revision: current.revision + 1,
        activatedAt:
          input.status === "active" ? current.activatedAt ?? now : current.activatedAt,
        pausedAt: input.status === "paused" ? now : null,
        pauseReason: input.status === "paused" ? input.reason : null,
        completedAt: input.status === "completed" ? now : current.completedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentAutonomyRollouts.id, current.id),
          eq(agentAutonomyRollouts.revision, current.revision),
        ),
      )
      .returning();
    if (!updated) throw new Error("Autonomy rollout transition lost its compare-and-swap");
    const eventType =
      input.status === "paused"
        ? "paused"
        : input.status === "rolled_back"
          ? "rolled_back"
          : input.status === "completed"
            ? "completed"
            : current.status === "paused"
              ? "resumed"
              : current.status === "draft"
                ? "activated"
                : "expanded";
    await tx.insert(agentAutonomyRolloutEvents).values({
      rolloutId: current.id,
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      eventType,
      fromStatus: current.status,
      toStatus: updated.status,
      fromStage: current.rolloutStage,
      toStage: updated.rolloutStage,
      fromLevel: current.autonomyLevel,
      toLevel: updated.autonomyLevel,
      fromCohortPercent: current.cohortPercent,
      toCohortPercent: updated.cohortPercent,
      reason: input.reason,
      evidenceRefs: input.evidenceRefs,
      owner: input.owner,
      createdAt: now,
    });
    return updated;
  });
}

export type AutonomyActionContext = {
  capability: string;
  effect: ToolEffect;
  risk: ToolRiskClass;
  resourceRef: string;
  destination: string | null;
  proposalHash: string;
  approvalValidated: boolean;
  certificationValidated: boolean;
  certificationId: string | null;
  reversible: boolean;
  estimatedCredits: number;
  estimatedMoneyMicros: number;
  resourceCount: number;
  scheduledObservation?: boolean;
  synthetic?: boolean;
};

type StopSignal = { id: string; key: string; severity: string };

export type AutonomyPolicyInput = {
  rollout: RolloutRow | null;
  action: AutonomyActionContext;
  cohortBucket: number | null;
  releaseValidated: boolean;
  stopSignals: StopSignal[];
  now: Date;
};

export type AutonomyPolicyDecision = {
  decision: AutonomyDecision;
  reason: string;
  cohortEligible: boolean;
};

function result(
  decision: AutonomyDecision,
  reason: string,
  cohortEligible = false,
): AutonomyPolicyDecision {
  return { decision, reason, cohortEligible };
}

/** Pure, ordered, fail-closed autonomy gate used by executor-bound checks. */
export function evaluateAutonomyPolicy(
  input: AutonomyPolicyInput,
): AutonomyPolicyDecision {
  const { rollout, action, now } = input;
  if (!rollout) {
    return result("deny", "No independently selected rollout authorizes this capability.");
  }
  if (rollout.status === "paused") {
    return result("pause", rollout.pauseReason ?? "The autonomy rollout is paused.");
  }
  if (rollout.status !== "active") {
    return result("deny", `The autonomy rollout is ${rollout.status}.`);
  }

  const riskBudget = autonomyRiskBudgetSchema.safeParse(rollout.riskBudget);
  const stopConditions = autonomyStopConditionsSchema.safeParse(
    rollout.stopConditions,
  );
  if (!riskBudget.success || !stopConditions.success) {
    return result("pause", "The rollout safety policy is invalid.");
  }
  if (
    now < rollout.observationWindowStartsAt ||
    now >= rollout.observationWindowEndsAt
  ) {
    return result("pause", "The approved observation window is not active.");
  }

  const configuredStops = new Set(stopConditions.data.sloKeys);
  const activeStop = input.stopSignals.find(
    (signal) =>
      configuredStops.has(signal.key) ||
      (stopConditions.data.pauseOnAnyCriticalIncident &&
        signal.severity === "critical"),
  );
  if (activeStop) {
    return result(
      "pause",
      `Operational stop condition ${activeStop.key} is active (${activeStop.id}).`,
    );
  }

  const budget = riskBudget.data;
  if (
    action.resourceCount > budget.maxResourcesPerAction ||
    action.estimatedCredits > budget.maxCreditsPerUtcDay ||
    action.estimatedMoneyMicros > budget.maxMoneyMicrosPerUtcDay
  ) {
    return result("deny", "The action exceeds the approved rollout risk budget.");
  }
  if (!budget.allowedUtcHours.includes(now.getUTCHours())) {
    return result("deny", "The action is outside the rollout's approved UTC hours.");
  }
  if (
    action.destination &&
    !budget.destinations.includes(action.destination)
  ) {
    return result("deny", "The action destination is outside the rollout scope.");
  }

  const cohortEligible =
    input.cohortBucket !== null &&
    input.cohortBucket < rollout.cohortPercent * 100;
  if (!cohortEligible) {
    return result(
      "shadow",
      "This brand is outside the current deterministic canary percentage.",
      false,
    );
  }

  if (rollout.executionMode === "eval" || rollout.executionMode === "shadow") {
    return result(
      "shadow",
      "The rollout records the counterfactual decision without executing it.",
      true,
    );
  }
  if (rollout.executionMode === "synthetic" && action.synthetic !== true) {
    return result(
      "deny",
      "A synthetic rollout cannot act on a production connector.",
      true,
    );
  }

  if (rollout.autonomyLevel === 0) {
    if (
      action.effect !== "read" ||
      (action.estimatedCredits > 0 && action.scheduledObservation !== true)
    ) {
      return result("deny", "Level 0 permits observation only.", true);
    }
    return result("allow", "Level 0 observation is within scope.", true);
  }
  if (rollout.autonomyLevel === 1) {
    return action.effect === "remote_write"
      ? result("deny", "Level 1 can prepare but cannot write externally.", true)
      : result("allow", "Level 1 preparation is within scope.", true);
  }

  if (action.effect !== "remote_write") {
    return result("allow", "The local action is below the rollout authority ceiling.", true);
  }
  if (
    !action.certificationValidated ||
    rollout.certificationId !== action.certificationId
  ) {
    return result("deny", "The exact remote capability certification is not active.", true);
  }
  if (rollout.rolloutStage === 5 || rollout.autonomyLevel === 2) {
    return action.approvalValidated
      ? result("allow", "The immutable proposal has fresh owner approval.", true)
      : result("approval_required", "This rollout requires approval for every write.", true);
  }
  if (!action.reversible || action.risk === "high" || action.risk === "critical") {
    return action.approvalValidated
      ? result("allow", "Fresh approval covers the elevated-risk exact proposal.", true)
      : result(
          "approval_required",
          "Irreversible and high-risk writes always require fresh approval.",
          true,
        );
  }
  if (rollout.autonomyLevel >= 3 && !input.releaseValidated) {
    return result("deny", "The behavior release is not in canary or released state.", true);
  }
  if (rollout.autonomyLevel === 4 && !rollout.strategyRef) {
    return result("deny", "Level 4 requires an approved strategy reference.", true);
  }
  return result(
    "allow",
    `Level ${rollout.autonomyLevel} delegated reversible low-risk authority is active.`,
    true,
  );
}

export function autonomyCohortBucket(subject: string, cohortKey: string): number {
  const digest = createHash("sha256").update(`${cohortKey}:${subject}`).digest();
  return digest.readUInt32BE(0) % 10_000;
}

function decisionKey(material: string) {
  return createHash("sha256").update(material).digest("hex");
}

export async function getAutonomyRollout(
  scope: BrandScope,
  capability: string,
) {
  const [rollout] = await getDb()
    .select()
    .from(agentAutonomyRollouts)
    .where(
      and(
        eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
        eq(agentAutonomyRollouts.brandId, scope.brandId),
        eq(agentAutonomyRollouts.capability, capability),
        inArray(agentAutonomyRollouts.status, ["active", "paused"]),
      ),
    )
    .orderBy(desc(agentAutonomyRollouts.updatedAt))
    .limit(1);
  return rollout ?? null;
}

export async function listAutonomyRollouts(scope: BrandScope) {
  return getDb()
    .select()
    .from(agentAutonomyRollouts)
    .where(
      and(
        eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
        eq(agentAutonomyRollouts.brandId, scope.brandId),
      ),
    )
    .orderBy(desc(agentAutonomyRollouts.updatedAt));
}

export async function listAutonomyDecisions(
  scope: BrandScope,
  options: { rolloutId?: string; limit?: number } = {},
) {
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  return getDb()
    .select()
    .from(agentAutonomyDecisions)
    .where(
      and(
        eq(agentAutonomyDecisions.workspaceId, scope.workspaceId),
        eq(agentAutonomyDecisions.brandId, scope.brandId),
        options.rolloutId
          ? eq(agentAutonomyDecisions.rolloutId, options.rolloutId)
          : undefined,
      ),
    )
    .orderBy(desc(agentAutonomyDecisions.createdAt))
    .limit(limit);
}

/** Owner-facing control only reduces authority; promotions remain internal. */
export async function pauseAutonomyRollout(
  scope: BrandScope,
  rolloutId: string,
  reason: string,
) {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(agentAutonomyRollouts)
      .where(
        and(
          eq(agentAutonomyRollouts.id, rolloutId),
          eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
          eq(agentAutonomyRollouts.brandId, scope.brandId),
          eq(agentAutonomyRollouts.status, "active"),
        ),
      )
      .for("update")
      .limit(1);
    if (!current) return null;
    const [rollout] = await tx
      .update(agentAutonomyRollouts)
      .set({
        status: "paused",
        revision: current.revision + 1,
        pausedAt: now,
        pauseReason: reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentAutonomyRollouts.id, current.id),
          eq(agentAutonomyRollouts.revision, current.revision),
        ),
      )
      .returning();
    if (!rollout) return null;
    await tx.insert(agentAutonomyRolloutEvents).values({
      rolloutId: current.id,
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      eventType: "paused",
      fromStatus: current.status,
      toStatus: rollout.status,
      fromStage: current.rolloutStage,
      toStage: rollout.rolloutStage,
      fromLevel: current.autonomyLevel,
      toLevel: rollout.autonomyLevel,
      fromCohortPercent: current.cohortPercent,
      toCohortPercent: rollout.cohortPercent,
      reason,
      evidenceRefs: ["owner:emergency-stop"],
      owner: "workspace-owner",
      createdAt: now,
    });
    return rollout;
  });
}

export async function authorizeAgentAutonomyAction(
  scope: BrandScope,
  input: AutonomyActionContext & {
    taskId?: string | null;
    baselineDecision?: Record<string, unknown>;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const rollout = await getAutonomyRollout(scope, input.capability);
  const [release, incidents] = await Promise.all([
    rollout?.releaseId
      ? getDb().query.agentBehaviorReleases.findFirst({
          where: eq(agentBehaviorReleases.id, rollout.releaseId),
        })
      : null,
    listOperationalIncidents({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      includeGlobal: true,
    }),
  ]);
  const cohortBucket = rollout
    ? autonomyCohortBucket(scope.brandId, rollout.cohortKey)
    : null;
  const stopSignals = incidents.map((incident) => ({
    id: incident.id,
    key: incident.sloKey,
    severity: incident.severity,
  }));
  const policy = evaluateAutonomyPolicy({
    rollout,
    action: input,
    cohortBucket,
    releaseValidated: release?.status === "canary" || release?.status === "released",
    stopSignals,
    now,
  });

  if (policy.decision === "pause" && rollout?.status === "active") {
    await pauseAutonomyRollout(scope, rollout.id, policy.reason);
    logError("claudia.autonomy_rollout_paused", {
      rolloutId: rollout.id,
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      capability: input.capability,
      reason: policy.reason,
    });
  }

  const stopFingerprint = stopSignals
    .map((signal) => `${signal.id}:${signal.key}`)
    .sort()
    .join(",");
  const key = decisionKey(
    [
      rollout?.id ?? "no-rollout",
      rollout?.revision ?? 0,
      input.proposalHash,
      input.taskId ?? "no-task",
      stopFingerprint,
    ].join(":"),
  );
  let [decision] = await getDb()
    .insert(agentAutonomyDecisions)
    .values({
      rolloutId: rollout?.id ?? null,
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      taskId: input.taskId ?? null,
      decisionKey: key,
      proposalHash: input.proposalHash,
      capability: input.capability,
      resourceRef: input.resourceRef,
      destination: input.destination,
      autonomyLevel: rollout?.autonomyLevel ?? 0,
      rolloutStage: rollout?.rolloutStage ?? 0,
      executionMode: rollout?.executionMode ?? "eval",
      cohortBucket,
      cohortEligible: policy.cohortEligible,
      approvalValidated: input.approvalValidated,
      certificationValidated: input.certificationValidated,
      decision: policy.decision,
      reason: policy.reason,
      baselineDecision: input.baselineDecision ?? {},
      policySnapshot: {
        policyVersion: AUTONOMY_ROLLOUT_POLICY_VERSION,
        rolloutRevision: rollout?.revision ?? null,
        riskBudget: rollout?.riskBudget ?? null,
        stopConditions: rollout?.stopConditions ?? null,
        activeStopSignals: stopSignals,
        releaseStatus: release?.status ?? null,
      },
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();
  if (!decision) {
    [decision] = await getDb()
      .select()
      .from(agentAutonomyDecisions)
      .where(
        and(
          eq(agentAutonomyDecisions.brandId, scope.brandId),
          eq(agentAutonomyDecisions.decisionKey, key),
        ),
      )
      .limit(1);
  }
  if (!decision) throw new Error("Autonomy decision could not be recorded");

  logInfo("claudia.autonomy_decision", {
    decisionId: decision.id,
    rolloutId: rollout?.id ?? null,
    workspaceId: scope.workspaceId,
    brandId: scope.brandId,
    capability: input.capability,
    decision: policy.decision,
    autonomyLevel: rollout?.autonomyLevel ?? 0,
    rolloutStage: rollout?.rolloutStage ?? 0,
    cohortBucket,
    cohortEligible: policy.cohortEligible,
  });
  return { rollout, decision, policy };
}

export type AutonomyReservation = {
  rolloutId: string;
  decisionId: string;
  rolloutRevision: number;
  riskBudget: AutonomyRiskBudget;
  stopConditions: AutonomyStopConditions;
};
