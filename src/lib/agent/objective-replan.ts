import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { replanAgentWork } from "@/lib/agent/planner";
import type { BrandScope } from "@/lib/brand/repository";
import { getDb } from "@/lib/db";
import {
  agentMissions,
  agentPlanVersions,
  agentScheduledWork,
} from "@/lib/db/schema";
import { logError } from "@/lib/logging/logger";

export const OBJECTIVE_REPLAN_SCHEDULE_KIND = "objective_replan";
const MAX_ATTEMPTS = 5;
const STALE_RUNNING_MS = 2 * 60_000;

const objectiveReplanPayloadSchema = z
  .object({
    missionId: z.string().uuid(),
    definitionVersion: z.number().int().positive(),
  })
  .strict();

export type ObjectiveReplanResult = {
  status: "completed" | "pending" | "superseded" | "not_required" | "dead_letter";
  planDiff: {
    fromVersion: number;
    toVersion: number;
    movedTaskCount: number;
  } | null;
  error: string | null;
};

export type ObjectiveReplanDrainSummary = {
  examined: number;
  completed: number;
  pending: number;
  superseded: number;
  deadLetter: number;
  failed: number;
};

function objectiveReplanResult(
  status: ObjectiveReplanResult["status"],
  options: Pick<ObjectiveReplanResult, "planDiff" | "error"> = {
    planDiff: null,
    error: null,
  },
): ObjectiveReplanResult {
  return { status, ...options };
}

export function classifyObjectiveReplanMarker(
  marker: Pick<
    typeof agentScheduledWork.$inferSelect,
    "status" | "lastError" | "operatorReplayRequested"
  >,
  hasPlanReceipt = false,
): ObjectiveReplanResult {
  if (hasPlanReceipt || marker.status === "completed") {
    return objectiveReplanResult("completed");
  }
  if (marker.status === "superseded") return objectiveReplanResult("superseded");
  if (marker.status === "dead_letter" && !marker.operatorReplayRequested) {
    return objectiveReplanResult("dead_letter", {
      planDiff: null,
      error: marker.lastError ?? "Objective plan refresh requires operator recovery.",
    });
  }
  return objectiveReplanResult("pending", {
    planDiff: null,
    error: marker.lastError,
  });
}

export function buildObjectiveReplanMarker(
  scope: BrandScope,
  mission: { id: string; definitionVersion: number },
) {
  const scheduleKey = `${mission.id}:v${mission.definitionVersion}`;
  return {
    workspaceId: scope.workspaceId,
    brandId: scope.brandId,
    scheduleKind: OBJECTIVE_REPLAN_SCHEDULE_KIND,
    scheduleKey,
    workflowInstanceId: `objective-replan:${scheduleKey}`,
    payload: {
      missionId: mission.id,
      definitionVersion: mission.definitionVersion,
    },
  };
}

async function settleMarker(
  id: string,
  scope: BrandScope,
  status: "completed" | "superseded",
  claimAttempt?: number,
) {
  const predicates = [
    eq(agentScheduledWork.id, id),
    eq(agentScheduledWork.workspaceId, scope.workspaceId),
    eq(agentScheduledWork.brandId, scope.brandId),
  ];
  if (claimAttempt !== undefined) {
    predicates.push(
      eq(agentScheduledWork.status, "running"),
      eq(agentScheduledWork.attemptCount, claimAttempt),
    );
  }
  const [settled] = await getDb()
    .update(agentScheduledWork)
    .set({
      status,
      lastError: null,
      retryAfter: null,
      operatorReplayRequested: false,
      deadLetteredAt: null,
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(...predicates))
    .returning({ id: agentScheduledWork.id });
  return Boolean(settled);
}

async function planCreatedForMarker(
  scope: BrandScope,
  missionId: string,
  scheduleKey: string,
) {
  const [plan] = await getDb()
    .select({ id: agentPlanVersions.id, version: agentPlanVersions.version })
    .from(agentPlanVersions)
    .where(
      and(
        eq(agentPlanVersions.workspaceId, scope.workspaceId),
        eq(agentPlanVersions.brandId, scope.brandId),
        eq(agentPlanVersions.missionId, missionId),
        sql`${agentPlanVersions.evidenceSnapshot}->>'objectiveReplanKey' = ${scheduleKey}`,
      ),
    )
    .orderBy(desc(agentPlanVersions.version))
    .limit(1);
  return plan ?? null;
}

async function currentMission(scope: BrandScope, missionId: string) {
  const [mission] = await getDb()
    .select()
    .from(agentMissions)
    .where(
      and(
        eq(agentMissions.id, missionId),
        eq(agentMissions.workspaceId, scope.workspaceId),
        eq(agentMissions.brandId, scope.brandId),
      ),
    )
    .limit(1);
  return mission ?? null;
}

async function objectiveReplanMarker(
  scope: BrandScope,
  markerIdentity: ReturnType<typeof buildObjectiveReplanMarker>,
) {
  const [marker] = await getDb()
    .select()
    .from(agentScheduledWork)
    .where(
      and(
        eq(agentScheduledWork.workspaceId, scope.workspaceId),
        eq(agentScheduledWork.brandId, scope.brandId),
        eq(agentScheduledWork.scheduleKind, OBJECTIVE_REPLAN_SCHEDULE_KIND),
        eq(agentScheduledWork.scheduleKey, markerIdentity.scheduleKey),
      ),
    )
    .limit(1);
  return marker ?? null;
}

async function deadLetterInvalidMarker(
  marker: typeof agentScheduledWork.$inferSelect,
  error = "Objective replan marker payload is invalid",
) {
  const [updated] = await getDb()
    .update(agentScheduledWork)
    .set({
      status: "dead_letter",
      lastError: error,
      retryAfter: null,
      operatorReplayRequested: false,
      deadLetteredAt: new Date(),
      settledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(agentScheduledWork.id, marker.id),
        eq(agentScheduledWork.workspaceId, marker.workspaceId),
        eq(agentScheduledWork.brandId, marker.brandId),
      ),
    )
    .returning({ id: agentScheduledWork.id });
  return Boolean(updated);
}

/** Read the durable replan state without claiming or mutating its marker. */
export async function getObjectiveReplanStatus(
  scope: BrandScope,
  input: { missionId: string; definitionVersion: number },
): Promise<ObjectiveReplanResult> {
  const mission = await currentMission(scope, input.missionId);
  if (!mission || mission.definitionVersion !== input.definitionVersion) {
    return objectiveReplanResult("superseded");
  }
  if (!mission.metric) return objectiveReplanResult("not_required");

  const markerIdentity = buildObjectiveReplanMarker(scope, {
    id: input.missionId,
    definitionVersion: input.definitionVersion,
  });
  const marker = await objectiveReplanMarker(scope, markerIdentity);
  if (!marker) return objectiveReplanResult("pending");

  const receipt = await planCreatedForMarker(
    scope,
    input.missionId,
    markerIdentity.scheduleKey,
  );
  return classifyObjectiveReplanMarker(marker, Boolean(receipt));
}

/**
 * Consume one durable objective-replan marker. The marker is claimed with a
 * compare-and-swap update, and plan evidence is the idempotency receipt if a
 * process dies after creating the immutable plan but before settling the row.
 */
export async function reconcileObjectiveReplan(
  scope: BrandScope,
  input: { missionId: string; definitionVersion: number },
): Promise<ObjectiveReplanResult> {
  const mission = await currentMission(scope, input.missionId);
  if (!mission) {
    return objectiveReplanResult("superseded");
  }
  if (!mission.metric) {
    return objectiveReplanResult("not_required");
  }

  const markerIdentity = buildObjectiveReplanMarker(scope, {
    id: input.missionId,
    definitionVersion: input.definitionVersion,
  });
  const db = getDb();
  await db
    .insert(agentScheduledWork)
    .values(markerIdentity)
    .onConflictDoNothing({
      target: [
        agentScheduledWork.scheduleKind,
        agentScheduledWork.brandId,
        agentScheduledWork.scheduleKey,
      ],
    });

  const marker = await objectiveReplanMarker(scope, markerIdentity);
  if (!marker) throw new Error("Objective replan marker could not be initialized");

  const payload = objectiveReplanPayloadSchema.safeParse(marker.payload);
  if (
    !payload.success ||
    payload.data.missionId !== input.missionId ||
    payload.data.definitionVersion !== input.definitionVersion
  ) {
    await deadLetterInvalidMarker(marker);
    return objectiveReplanResult("dead_letter", {
      planDiff: null,
      error: "Objective replan marker payload is invalid",
    });
  }

  if (mission.definitionVersion !== input.definitionVersion) {
    await settleMarker(marker.id, scope, "superseded");
    return objectiveReplanResult("superseded");
  }

  const existingPlan = await planCreatedForMarker(
    scope,
    input.missionId,
    markerIdentity.scheduleKey,
  );
  if (existingPlan) {
    await settleMarker(marker.id, scope, "completed");
    return objectiveReplanResult("completed");
  }
  const markerState = classifyObjectiveReplanMarker(marker);
  if (markerState.status !== "pending") return markerState;

  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_RUNNING_MS);
  const [claimed] = await db
    .update(agentScheduledWork)
    .set({
      status: "running",
      attemptCount: sql`${agentScheduledWork.attemptCount} + 1`,
      lastError: null,
      retryAfter: null,
      deadLetteredAt: null,
      operatorReplayRequested: false,
      settledAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentScheduledWork.id, marker.id),
        eq(agentScheduledWork.workspaceId, scope.workspaceId),
        eq(agentScheduledWork.brandId, scope.brandId),
        or(
          eq(agentScheduledWork.operatorReplayRequested, true),
          and(
            inArray(agentScheduledWork.status, ["expected", "enqueue_failed"]),
            or(
              isNull(agentScheduledWork.retryAfter),
              lte(agentScheduledWork.retryAfter, now),
            ),
          ),
          and(
            eq(agentScheduledWork.status, "running"),
            lt(agentScheduledWork.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();
  if (!claimed) return getObjectiveReplanStatus(scope, input);

  try {
    const latestMission = await currentMission(scope, input.missionId);
    if (!latestMission || latestMission.definitionVersion !== input.definitionVersion) {
      await settleMarker(marker.id, scope, "superseded", claimed.attemptCount);
      return objectiveReplanResult("superseded");
    }

    const concurrentReceipt = await planCreatedForMarker(
      scope,
      input.missionId,
      markerIdentity.scheduleKey,
    );
    if (concurrentReceipt) {
      await settleMarker(marker.id, scope, "completed", claimed.attemptCount);
      return objectiveReplanResult("completed");
    }

    const replanned = await replanAgentWork(
      scope,
      `Owner updated objective: ${latestMission.objective}`,
      {
        source: "owner_objective",
        objectiveReplanKey: markerIdentity.scheduleKey,
        objectiveReplanWorkId: markerIdentity.workflowInstanceId,
        missionId: latestMission.id,
        definitionVersion: latestMission.definitionVersion,
        metric: latestMission.metric,
      },
      {
        expectedMissionDefinitionVersion: input.definitionVersion,
        objectiveReplanKey: markerIdentity.scheduleKey,
      },
    );
    await settleMarker(marker.id, scope, "completed", claimed.attemptCount);
    if (replanned.alreadyApplied) return objectiveReplanResult("completed");
    return {
      status: "completed",
      planDiff: {
        fromVersion: replanned.current.version,
        toVersion: replanned.plan.version,
        movedTaskCount: replanned.movedTaskCount,
      },
      error: null,
    };
  } catch (error) {
    const missionAfterFailure = await currentMission(scope, input.missionId);
    if (
      !missionAfterFailure ||
      missionAfterFailure.definitionVersion !== input.definitionVersion
    ) {
      await settleMarker(marker.id, scope, "superseded", claimed.attemptCount);
      return objectiveReplanResult("superseded");
    }

    const failedAt = new Date();
    const deadLetter = claimed.attemptCount >= MAX_ATTEMPTS;
    const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
    const [failedMarker] = await db
      .update(agentScheduledWork)
      .set({
        status: deadLetter ? "dead_letter" : "enqueue_failed",
        lastError: errorMessage,
        retryAfter: deadLetter
          ? null
          : new Date(failedAt.getTime() + Math.min(60, 5 * 2 ** (claimed.attemptCount - 1)) * 60_000),
        deadLetteredAt: deadLetter ? failedAt : null,
        settledAt: deadLetter ? failedAt : null,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(agentScheduledWork.id, marker.id),
          eq(agentScheduledWork.workspaceId, scope.workspaceId),
          eq(agentScheduledWork.brandId, scope.brandId),
          eq(agentScheduledWork.status, "running"),
          eq(agentScheduledWork.attemptCount, claimed.attemptCount),
        ),
      )
      .returning({ id: agentScheduledWork.id });
    logError("agent.objective_replan_failed", {
      brandId: scope.brandId,
      missionId: input.missionId,
      definitionVersion: input.definitionVersion,
      attempt: claimed.attemptCount,
      error: errorMessage,
    });
    if (!failedMarker) return getObjectiveReplanStatus(scope, input);
    return objectiveReplanResult(deadLetter ? "dead_letter" : "pending", {
      planDiff: null,
      error: errorMessage,
    });
  }
}

/**
 * Bounded cron drain for committed objective-plan work. Every marker carries
 * its own tenant scope; reconciliation repeats that scope on every read/write.
 */
export async function drainObjectiveReplans(
  options: { limit?: number; now?: Date } = {},
): Promise<ObjectiveReplanDrainSummary> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  const now = options.now ?? new Date();
  const staleBefore = new Date(now.getTime() - STALE_RUNNING_MS);
  const rows = await getDb()
    .select()
    .from(agentScheduledWork)
    .where(
      and(
        eq(agentScheduledWork.scheduleKind, OBJECTIVE_REPLAN_SCHEDULE_KIND),
        or(
          eq(agentScheduledWork.operatorReplayRequested, true),
          and(
            inArray(agentScheduledWork.status, ["expected", "enqueue_failed"]),
            or(
              isNull(agentScheduledWork.retryAfter),
              lte(agentScheduledWork.retryAfter, now),
            ),
          ),
          and(
            eq(agentScheduledWork.status, "running"),
            lt(agentScheduledWork.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(agentScheduledWork.createdAt))
    .limit(limit);

  const summary: ObjectiveReplanDrainSummary = {
    examined: rows.length,
    completed: 0,
    pending: 0,
    superseded: 0,
    deadLetter: 0,
    failed: 0,
  };
  for (const row of rows) {
    const payload = objectiveReplanPayloadSchema.safeParse(row.payload);
    if (!payload.success) {
      await deadLetterInvalidMarker(row);
      summary.deadLetter += 1;
      continue;
    }
    try {
      const result = await reconcileObjectiveReplan(
        { workspaceId: row.workspaceId, brandId: row.brandId },
        payload.data,
      );
      if (result.status === "completed") summary.completed += 1;
      else if (result.status === "superseded" || result.status === "not_required") {
        summary.superseded += 1;
      } else if (result.status === "dead_letter") summary.deadLetter += 1;
      else summary.pending += 1;
    } catch (error) {
      summary.failed += 1;
      logError("agent.objective_replan_drain_failed", {
        workspaceId: row.workspaceId,
        brandId: row.brandId,
        workId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
