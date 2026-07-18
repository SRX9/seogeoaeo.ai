import { and, asc, count, eq, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentScheduledWork } from "@/lib/db/schema";
import type { InstanceOptions } from "@/lib/jobs/workflow";
import type { BrandScope } from "@/lib/brand/repository";

export type ScheduledWorkExpectation = {
  workspaceId: string;
  brandId: string;
  scheduleKind: string;
  scheduleKey: string;
  instance: InstanceOptions;
};

/** Persist the full expected fan-out before attempting any Workflow creates. */
export async function recordExpectedScheduledWork(items: ScheduledWorkExpectation[]) {
  if (items.length === 0) return;
  await getDb()
    .insert(agentScheduledWork)
    .values(
      items.map(({ workspaceId, brandId, scheduleKind, scheduleKey, instance }) => ({
        workspaceId,
        brandId,
        scheduleKind,
        scheduleKey,
        workflowInstanceId: instance.id,
        payload: instance.params,
      })),
    )
    .onConflictDoUpdate({
      target: [
        agentScheduledWork.scheduleKind,
        agentScheduledWork.brandId,
        agentScheduledWork.scheduleKey,
      ],
      set: {
        payload: sql`excluded.payload`,
        // Preserve the physical executor that actually completed historical
        // work. Re-enumerating the same logical day must not erase its trace.
        workflowInstanceId: sql`case when ${agentScheduledWork.status} = 'completed' then ${agentScheduledWork.workflowInstanceId} else excluded.workflow_instance_id end`,
        updatedAt: new Date(),
      },
    });
}

export async function recordScheduledEnqueueOutcome(
  workflowInstanceId: string,
  outcome: "created" | "exists" | "failed",
  error?: unknown,
) {
  const now = new Date();
  if (outcome !== "failed") {
    await getDb()
      .update(agentScheduledWork)
      .set({
        status: outcome === "created" ? "enqueued" : "running",
        attemptCount: sql`${agentScheduledWork.attemptCount} + 1`,
        lastError: null,
        retryAfter: null,
        operatorReplayRequested: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(agentScheduledWork.workflowInstanceId, workflowInstanceId),
          ne(agentScheduledWork.status, "completed"),
        ),
      );
    return;
  }

  await getDb()
    .update(agentScheduledWork)
    .set({
      status: sql`case when ${agentScheduledWork.attemptCount} + 1 >= 5 then 'dead_letter' else 'enqueue_failed' end`,
      attemptCount: sql`${agentScheduledWork.attemptCount} + 1`,
      lastError: (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
      retryAfter: new Date(now.getTime() + 5 * 60_000),
      deadLetteredAt: sql`case when ${agentScheduledWork.attemptCount} + 1 >= 5 then ${now} else ${agentScheduledWork.deadLetteredAt} end`,
      updatedAt: now,
    })
    .where(eq(agentScheduledWork.workflowInstanceId, workflowInstanceId));
}

/** Prior dropped work and explicit operator replays join the next enumeration. */
export async function listReplayableScheduledWork(scheduleKind: string, limit = 500) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 2 * 60 * 60_000);
  return getDb()
    .select()
    .from(agentScheduledWork)
    .where(
      and(
        eq(agentScheduledWork.scheduleKind, scheduleKind),
        or(
          eq(agentScheduledWork.operatorReplayRequested, true),
          and(
            inArray(agentScheduledWork.status, ["expected", "enqueue_failed"]),
            or(isNull(agentScheduledWork.retryAfter), lte(agentScheduledWork.retryAfter, now)),
          ),
          and(
            inArray(agentScheduledWork.status, ["enqueued", "running"]),
            lt(agentScheduledWork.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(agentScheduledWork.createdAt))
    .limit(limit);
}

/** Move one logical scheduled item to a fresh physical Workflow executor. */
export async function assignScheduledReplayInstance(id: string, workflowInstanceId: string) {
  const [row] = await getDb()
    .update(agentScheduledWork)
    .set({
      workflowInstanceId,
      status: "expected",
      operatorReplayRequested: false,
      retryAfter: null,
      lastError: null,
      deadLetteredAt: null,
      settledAt: null,
      updatedAt: new Date(),
    })
    .where(eq(agentScheduledWork.id, id))
    .returning();
  if (!row) throw new Error("Scheduled replay item was not found");
  return row;
}

/** Cron-authenticated operator hook; the next enumeration assigns a fresh instance. */
export async function requestScheduledWorkReplay(id: string, scope?: BrandScope) {
  const [row] = await getDb()
    .update(agentScheduledWork)
    .set({ operatorReplayRequested: true, updatedAt: new Date() })
    .where(
      and(
        eq(agentScheduledWork.id, id),
        scope ? eq(agentScheduledWork.workspaceId, scope.workspaceId) : undefined,
        scope ? eq(agentScheduledWork.brandId, scope.brandId) : undefined,
      ),
    )
    .returning({ id: agentScheduledWork.id });
  return Boolean(row);
}

export async function settleScheduledWork(workflowInstanceId: string, status = "completed") {
  await getDb()
    .update(agentScheduledWork)
    .set({ status, settledAt: new Date(), retryAfter: null, updatedAt: new Date() })
    .where(eq(agentScheduledWork.workflowInstanceId, workflowInstanceId));
}

/** SLO signal used by cron logging/alerts: expected work open for over two hours. */
export async function countScheduledWorkPastSlo(scheduleKind: string, now = new Date()) {
  const [row] = await getDb()
    .select({ value: count() })
    .from(agentScheduledWork)
    .where(
      and(
        eq(agentScheduledWork.scheduleKind, scheduleKind),
        inArray(agentScheduledWork.status, ["expected", "enqueue_failed", "enqueued", "running"]),
        lt(agentScheduledWork.createdAt, new Date(now.getTime() - 2 * 60 * 60_000)),
      ),
    );
  return row?.value ?? 0;
}
