import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentStepExecutions } from "@/lib/db/schema";
import { logError } from "@/lib/logging/logger";
import {
  recordStepTraceSettlement,
  recordStepTraceStart,
} from "@/lib/observability/trace";

export const EXECUTION_OUTCOMES = [
  "completed",
  "completed_degraded",
  "no_work",
  "paused",
  "blocked",
  "insufficient_credits",
  "transient_failure",
  "permanent_failure",
] as const;

export type ExecutionOutcome = (typeof EXECUTION_OUTCOMES)[number];
export type ExecutionErrorClass =
  | "timeout"
  | "rate_limited"
  | "provider_unavailable"
  | "network"
  | "validation"
  | "authorization"
  | "not_found"
  | "insufficient_credits"
  | "safety_block"
  | "lease_contention"
  | "unknown";

export type StepIdentity = {
  workspaceId: string;
  brandId?: string | null;
  workflowInstanceId: string;
  stepKey: string;
  workKey?: string;
  missionId?: string | null;
  planVersionId?: string | null;
  taskId?: string | null;
  input?: Record<string, unknown>;
};

export type ClassifiedExecutionError = {
  code: string;
  errorClass: ExecutionErrorClass;
  retryable: boolean;
  message: string;
};

const boundedMessage = (value: unknown, limit = 2_000) =>
  (value instanceof Error ? value.message : String(value)).slice(0, limit);

/** Shared failure taxonomy used by Workflow routes and recovery tooling. */
export function classifyExecutionError(error: unknown): ClassifiedExecutionError {
  const message = boundedMessage(error);
  const normalized = message.toLowerCase();
  const status =
    typeof error === "object" && error && "status" in error && typeof error.status === "number"
      ? error.status
      : null;

  if (/live execution lease|live .* lease|lease contention/.test(normalized)) {
    return { code: "lease_contention", errorClass: "lease_contention", retryable: true, message };
  }

  if (/insufficient credits|not enough credits/.test(normalized)) {
    return { code: "insufficient_credits", errorClass: "insufficient_credits", retryable: false, message };
  }
  if (/paused by owner|blocked by owner|safety|kill switch/.test(normalized)) {
    return { code: "safety_block", errorClass: "safety_block", retryable: false, message };
  }
  if (status === 401 || status === 403 || /unauthori[sz]ed|forbidden/.test(normalized)) {
    return { code: `http_${status ?? 403}`, errorClass: "authorization", retryable: false, message };
  }
  if (status === 404 || /not found|does not belong/.test(normalized)) {
    return { code: "not_found", errorClass: "not_found", retryable: false, message };
  }
  if (status === 429 || /rate.?limit|too many requests/.test(normalized)) {
    return { code: "rate_limited", errorClass: "rate_limited", retryable: true, message };
  }
  if (/timeout|timed out|abort/.test(normalized)) {
    return { code: "timeout", errorClass: "timeout", retryable: true, message };
  }
  if ((status != null && status >= 500) || /overloaded|unavailable|bad gateway/.test(normalized)) {
    return { code: `http_${status ?? 503}`, errorClass: "provider_unavailable", retryable: true, message };
  }
  if (/fetch failed|network|econn|socket|dns/.test(normalized)) {
    return { code: "network", errorClass: "network", retryable: true, message };
  }
  if (/invalid|validation|malformed|schema/.test(normalized)) {
    return { code: "validation", errorClass: "validation", retryable: false, message };
  }
  // Unknown infrastructure failures are retried within the bounded Workflow
  // policy. Known validation/authorization errors above remain permanent.
  return { code: "unknown", errorClass: "unknown", retryable: true, message };
}

export function isTerminalExecutionStatus(status: string): boolean {
  return status === "completed" || status === "completed_degraded" || status === "permanent_failure";
}

export function canTakeOverLease(
  execution: { status: string; leaseExpiresAt: Date | null; retryAfter?: Date | null },
  now = new Date(),
): boolean {
  if (isTerminalExecutionStatus(execution.status)) return false;
  if (execution.retryAfter && execution.retryAfter > now) return false;
  return execution.status !== "running" || !execution.leaseExpiresAt || execution.leaseExpiresAt <= now;
}

/** Persist all retry-stable identifiers before any long-running effect starts. */
export async function ensureStepExecution(identity: StepIdentity) {
  const workKey = identity.workKey ?? "default";
  const [created] = await getDb()
    .insert(agentStepExecutions)
    .values({
      workspaceId: identity.workspaceId,
      brandId: identity.brandId,
      missionId: identity.missionId ?? null,
      planVersionId: identity.planVersionId ?? null,
      taskId: identity.taskId ?? null,
      workflowInstanceId: identity.workflowInstanceId,
      stepKey: identity.stepKey,
      workKey,
      input: identity.input ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [existing] = await getDb()
    .select()
    .from(agentStepExecutions)
    .where(
      and(
        eq(agentStepExecutions.workflowInstanceId, identity.workflowInstanceId),
        eq(agentStepExecutions.stepKey, identity.stepKey),
        eq(agentStepExecutions.workKey, workKey),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Stable step execution identity could not be created");
  return existing;
}

/** Atomic claim or expired-lease takeover. A live lease can never be stolen. */
export async function claimStepExecution(
  identity: StepIdentity,
  executorId: string,
  options: { leaseMs?: number; now?: Date } = {},
) {
  const execution = await ensureStepExecution(identity);
  if (isTerminalExecutionStatus(execution.status)) {
    return { claimed: false as const, reason: "settled" as const, execution };
  }
  const now = options.now ?? new Date();
  const leaseExpiresAt = new Date(now.getTime() + (options.leaseMs ?? 2 * 60_000));
  const [claimed] = await getDb()
    .update(agentStepExecutions)
    .set({
      status: "running",
      leaseOwner: executorId,
      leaseExpiresAt,
      heartbeatAt: now,
      // Raw sql`` params bypass drizzle's column mapping, and postgres.js cannot
      // serialize a JS Date it receives unmapped — pass the ISO string instead.
      startedAt: sql`coalesce(${agentStepExecutions.startedAt}, ${now.toISOString()})`,
      originalExecutorId: sql`coalesce(${agentStepExecutions.originalExecutorId}, ${executorId})`,
      takeoverExecutorId: sql`case when ${agentStepExecutions.originalExecutorId} is not null and ${agentStepExecutions.originalExecutorId} <> ${executorId} then ${executorId} else ${agentStepExecutions.takeoverExecutorId} end`,
      attemptCount: sql`${agentStepExecutions.attemptCount} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentStepExecutions.id, execution.id),
        or(
          inArray(agentStepExecutions.status, ["pending", "retryable"]),
          and(
            eq(agentStepExecutions.status, "running"),
            or(
              isNull(agentStepExecutions.leaseExpiresAt),
              lte(agentStepExecutions.leaseExpiresAt, now),
            ),
          ),
        ),
        or(isNull(agentStepExecutions.retryAfter), lte(agentStepExecutions.retryAfter, now)),
      ),
    )
    .returning();
  if (claimed) {
    // Trace creation is a precondition for executing side effects. If this
    // fails, the caller does not enter the work function and the lease can be
    // recovered safely after expiry.
    await recordStepTraceStart(claimed, executorId);
    return { claimed: true as const, reason: "claimed" as const, execution: claimed };
  }

  const [current] = await getDb()
    .select()
    .from(agentStepExecutions)
    .where(eq(agentStepExecutions.id, execution.id))
    .limit(1);
  return {
    claimed: false as const,
    reason: isTerminalExecutionStatus(current?.status ?? "") ? ("settled" as const) : ("leased" as const),
    execution: current ?? execution,
  };
}

export async function heartbeatStepExecution(id: string, executorId: string, leaseMs = 15 * 60_000) {
  const now = new Date();
  const [row] = await getDb()
    .update(agentStepExecutions)
    .set({ heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now })
    .where(
      and(
        eq(agentStepExecutions.id, id),
        eq(agentStepExecutions.status, "running"),
        eq(agentStepExecutions.leaseOwner, executorId),
      ),
    )
    .returning({ id: agentStepExecutions.id });
  return Boolean(row);
}

/** Keep a long-running claim live without allowing overlapping heartbeat writes. */
export async function withStepHeartbeat<T>(
  id: string,
  executorId: string,
  work: () => Promise<T>,
  options: { leaseMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const leaseMs = options.leaseMs ?? 2 * 60_000;
  const intervalMs = options.intervalMs ?? 30_000;
  let heartbeatInFlight = false;
  let leaseLost = false;
  const timer = setInterval(() => {
    if (heartbeatInFlight || leaseLost) return;
    heartbeatInFlight = true;
    void heartbeatStepExecution(id, executorId, leaseMs)
      .then((alive) => {
        if (!alive) leaseLost = true;
      })
      .catch(() => {
        // A single heartbeat transport failure does not prove lease loss. The
        // next heartbeat or final CAS settlement remains authoritative.
      })
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, intervalMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  try {
    const result = await work();
    if (leaseLost) throw new Error("Step execution lease was lost during work");
    return result;
  } finally {
    clearInterval(timer);
  }
}

/** Persist an externally-created output identifier before continuing expensive work. */
export async function recordStepOutputRef(id: string, executorId: string, outputRef: string) {
  const [row] = await getDb()
    .update(agentStepExecutions)
    .set({ outputRef, heartbeatAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(agentStepExecutions.id, id),
        eq(agentStepExecutions.status, "running"),
        eq(agentStepExecutions.leaseOwner, executorId),
      ),
    )
    .returning({ id: agentStepExecutions.id });
  if (!row) throw new Error("Step execution lease was lost before output checkpoint");
}

export async function settleStepExecution(
  id: string,
  executorId: string,
  outcome: ExecutionOutcome,
  options: {
    output?: Record<string, unknown>;
    outputRef?: string | null;
    error?: ClassifiedExecutionError;
    retryAfter?: Date | null;
  } = {},
) {
  const retryable = outcome === "transient_failure";
  const status = retryable
    ? "retryable"
    : outcome === "permanent_failure"
      ? "permanent_failure"
      : outcome === "completed_degraded"
        ? "completed_degraded"
        : "completed";
  const now = new Date();
  const [row] = await getDb()
    .update(agentStepExecutions)
    .set({
      status,
      outcome,
      output: options.output ?? null,
      outputRef: options.outputRef === undefined ? undefined : options.outputRef,
      lastErrorCode: options.error?.code ?? null,
      lastErrorClass: options.error?.errorClass ?? null,
      lastError: options.error?.message ?? null,
      retryAfter: retryable ? (options.retryAfter ?? now) : null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: now,
      settledAt: retryable ? null : now,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentStepExecutions.id, id),
        eq(agentStepExecutions.status, "running"),
        eq(agentStepExecutions.leaseOwner, executorId),
      ),
    )
    .returning();
  if (!row) throw new Error("Step execution lease was lost before settlement");
  // The durable execution row is authoritative. A trace projection failure
  // must be alerted, but must not make a completed side effect execute twice.
  try {
    await recordStepTraceSettlement(row);
  } catch (error) {
    logError("observability.step_trace_settlement_failed", {
      workspaceId: row.workspaceId,
      brandId: row.brandId,
      workflowInstanceId: row.workflowInstanceId,
      stepExecutionId: row.id,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
  }
  return row;
}
