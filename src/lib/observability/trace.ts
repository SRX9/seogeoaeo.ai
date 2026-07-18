import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import { CLAUDIA_COMPONENT_VERSIONS } from "@/lib/agent/versions";
import { getDb } from "@/lib/db";
import { agentStepExecutions, agentTraceSpans, creditLedger } from "@/lib/db/schema";
import { logError } from "@/lib/logging/logger";

export const TRACE_RETENTION_DAYS = 30;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 80;
const MAX_STRING_LENGTH = 2_000;

const SECRET_KEY =
  /(?:authorization|cookie|password|secret|^(?:token|session)$|(?:access|refresh|callback|bearer|auth)[_-]?token|api[_-]?key|private[_-]?key|credential|encryption[_-]?key)/i;
const HIDDEN_REASONING_KEY =
  /^(?:chain[_-]?of[_-]?thought|hidden[_-]?reasoning|internal[_-]?(?:reasoning|thoughts?)|thinking)$/i;

function retentionUntil(now = new Date()) {
  return new Date(now.getTime() + TRACE_RETENTION_DAYS * 24 * 60 * 60_000);
}

function boundedString(value: string) {
  const scrubbed = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|token|api)-[A-Za-z0-9_-]{12,}\b/gi, "[redacted]");
  return scrubbed.length > MAX_STRING_LENGTH
    ? `${scrubbed.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : scrubbed;
}

/**
 * Remove credentials and hidden reasoning while bounding attacker-controlled
 * payload size. Structured decisions, concise rationale, and evidence refs are
 * intentionally preserved.
 */
export function redactTraceValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") return boundedString(value);
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[depth-limited]";
  if (Array.isArray(value)) {
    const redacted = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactTraceValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) redacted.push("[items-truncated]");
    return redacted;
  }
  if (typeof value !== "object") return boundedString(String(value));

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  const output: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (SECRET_KEY.test(key)) {
      output[key] = "[redacted]";
    } else if (HIDDEN_REASONING_KEY.test(key)) {
      output[key] = "[omitted-hidden-reasoning]";
    } else {
      output[key] = redactTraceValue(item, depth + 1);
    }
  }
  if (Object.keys(value as object).length > MAX_OBJECT_KEYS) {
    output._truncated = true;
  }
  return output;
}

function redactedRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const redacted = redactTraceValue(value);
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : { value: redacted };
}

function decisionRecord(input: Record<string, unknown> | null) {
  if (!input) return null;
  const record: Record<string, unknown> = {};
  for (const key of ["decision", "policyDecision", "candidates", "rationale", "evidenceRefs"]) {
    if (input[key] !== undefined) record[key] = redactTraceValue(input[key]);
  }
  return Object.keys(record).length > 0 ? record : null;
}

function toolSchemaVersion(input: Record<string, unknown> | null) {
  const tool = input?.tool;
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
    return CLAUDIA_COMPONENT_VERSIONS.toolSchemas;
  }
  const version = (tool as Record<string, unknown>).version;
  return typeof version === "string" ? version : CLAUDIA_COMPONENT_VERSIONS.toolSchemas;
}

function finiteNonnegative(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function structuredCost(
  input: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
) {
  const candidates = [
    output?.actualCost,
    output?.cost,
    input?.actualCost,
    input?.estimatedCost,
    input?.cost,
  ];
  const cost = candidates.find(
    (candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate),
  ) as Record<string, unknown> | undefined;
  return {
    credits: finiteNonnegative(cost?.credits),
    tokens: finiteNonnegative(cost?.tokens),
    moneyMicros: finiteNonnegative(cost?.moneyMicros),
  };
}

export function workflowTraceId(workspaceId: string, workflowInstanceId: string) {
  return `workflow:${workspaceId}:${workflowInstanceId}`;
}

export async function recordStepTraceStart(
  execution: typeof agentStepExecutions.$inferSelect,
  requestId: string,
) {
  const now = new Date();
  const traceId = workflowTraceId(execution.workspaceId, execution.workflowInstanceId);
  const db = getDb();
  const [createdRoot] = await db
    .insert(agentTraceSpans)
    .values({
      workspaceId: execution.workspaceId,
      brandId: execution.brandId,
      traceId,
      spanKey: "workflow",
      spanType: "workflow",
      name: execution.workflowInstanceId,
      status: "running",
      runId: execution.workflowInstanceId,
      workflowInstanceId: execution.workflowInstanceId,
      retentionUntil: retentionUntil(now),
      startedAt: execution.createdAt,
    })
    .onConflictDoNothing()
    .returning({ id: agentTraceSpans.id });
  const root =
    createdRoot ??
    (await db.query.agentTraceSpans.findFirst({
      where: and(eq(agentTraceSpans.traceId, traceId), eq(agentTraceSpans.spanKey, "workflow")),
      columns: { id: true },
    }));
  if (!root) throw new Error("Workflow trace root could not be recorded");

  const input = redactedRecord(execution.input);
  await db
    .insert(agentTraceSpans)
    .values({
      workspaceId: execution.workspaceId,
      brandId: execution.brandId,
      traceId,
      spanKey: `step:${execution.id}`,
      parentSpanId: root.id,
      spanType: "step",
      name: execution.stepKey,
      status: "running",
      requestId,
      runId: execution.workflowInstanceId,
      missionId: execution.missionId,
      planVersionId: execution.planVersionId,
      taskId: execution.taskId,
      workflowInstanceId: execution.workflowInstanceId,
      stepExecutionId: execution.id,
      toolSchemaVersion: toolSchemaVersion(execution.input),
      policyVersion: CLAUDIA_COMPONENT_VERSIONS.deterministicPolicy,
      redactedInput: input,
      decisionRecord: decisionRecord(input),
      retryCount: Math.max(0, execution.attemptCount - 1),
      retentionUntil: retentionUntil(now),
      startedAt: execution.startedAt ?? now,
      attributes: {
        workKey: execution.workKey,
        actionId: execution.actionId,
        billingWorkId: execution.billingWorkId,
        originalExecutorId: execution.originalExecutorId,
        takeoverExecutorId: execution.takeoverExecutorId,
      },
    })
    .onConflictDoUpdate({
      target: [agentTraceSpans.traceId, agentTraceSpans.spanKey],
      set: {
        status: "running",
        requestId,
        redactedInput: input,
        decisionRecord: decisionRecord(input),
        retryCount: Math.max(0, execution.attemptCount - 1),
        errorClass: null,
        endedAt: null,
        retentionUntil: retentionUntil(now),
        updatedAt: now,
      },
    });
}

export async function recordStepTraceSettlement(
  execution: typeof agentStepExecutions.$inferSelect,
) {
  const endedAt = execution.settledAt ?? new Date();
  const status =
    execution.outcome === "permanent_failure"
      ? "failed"
      : execution.outcome === "completed_degraded"
        ? "degraded"
        : execution.outcome === "blocked" || execution.outcome === "paused"
          ? "blocked"
          : execution.outcome === "transient_failure"
            ? "running"
            : "completed";
  const [creditSpend] = await getDb()
    .select({
      value: sql<number>`coalesce(-sum(case when ${creditLedger.delta} < 0 then ${creditLedger.delta} else 0 end), 0)`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.workspaceId, execution.workspaceId),
        eq(creditLedger.refId, execution.billingWorkId),
      ),
    );
  const cost = structuredCost(execution.input, execution.output);
  const ledgerCredits = Number(creditSpend?.value ?? 0);
  await getDb()
    .update(agentTraceSpans)
    .set({
      status,
      redactedOutput: redactedRecord(execution.output),
      retryCount: Math.max(0, execution.attemptCount - 1),
      errorClass: execution.lastErrorClass,
      totalTokens: cost.tokens,
      creditsCharged: ledgerCredits > 0 ? ledgerCredits : cost.credits,
      monetaryCostMicros: cost.moneyMicros,
      wallClockMs: execution.startedAt
        ? Math.max(0, endedAt.getTime() - execution.startedAt.getTime())
        : null,
      endedAt: execution.outcome === "transient_failure" ? null : endedAt,
      updatedAt: endedAt,
    })
    .where(
      and(
        eq(
          agentTraceSpans.traceId,
          workflowTraceId(execution.workspaceId, execution.workflowInstanceId),
        ),
        eq(agentTraceSpans.spanKey, `step:${execution.id}`),
      ),
    );
}

export async function recordLlmTrace(input: {
  callId: string;
  workspaceId?: string | null;
  brandId?: string | null;
  stepExecutionId?: string | null;
  provider: string;
  model: string;
  tier: string;
  promptVersion: string;
  status: "completed" | "failed";
  errorClass?: string | null;
  latencyMs: number;
  retryCount: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  terminationReason?: string | null;
}) {
  const step = input.stepExecutionId
    ? await getDb().query.agentStepExecutions.findFirst({
        where: eq(agentStepExecutions.id, input.stepExecutionId),
      })
    : null;
  const traceId = step
    ? workflowTraceId(step.workspaceId, step.workflowInstanceId)
    : `llm:${input.callId}`;
  const parent = step
    ? await getDb().query.agentTraceSpans.findFirst({
        where: and(
          eq(agentTraceSpans.traceId, traceId),
          eq(agentTraceSpans.spanKey, `step:${step.id}`),
        ),
        columns: { id: true },
      })
    : null;
  const endedAt = new Date();
  await getDb()
    .insert(agentTraceSpans)
    .values({
      workspaceId: input.workspaceId ?? step?.workspaceId ?? null,
      brandId: input.brandId ?? step?.brandId ?? null,
      traceId,
      spanKey: `llm:${input.callId}`,
      parentSpanId: parent?.id ?? null,
      spanType: "llm",
      name: `${input.provider}:${input.tier}`,
      status: input.status === "completed" ? "completed" : "failed",
      runId: step?.workflowInstanceId ?? null,
      missionId: step?.missionId ?? null,
      planVersionId: step?.planVersionId ?? null,
      taskId: step?.taskId ?? null,
      workflowInstanceId: step?.workflowInstanceId ?? null,
      stepExecutionId: step?.id ?? null,
      model: input.model,
      promptVersion: input.promptVersion,
      toolSchemaVersion: CLAUDIA_COMPONENT_VERSIONS.toolSchemas,
      policyVersion: CLAUDIA_COMPONENT_VERSIONS.deterministicPolicy,
      retryCount: input.retryCount,
      errorClass: input.errorClass ?? null,
      promptTokens: input.promptTokens ?? null,
      completionTokens: input.completionTokens ?? null,
      totalTokens: input.totalTokens ?? null,
      wallClockMs: input.latencyMs,
      attributes: {
        callId: input.callId,
        terminationReason: input.terminationReason ?? null,
      },
      startedAt: new Date(endedAt.getTime() - input.latencyMs),
      endedAt,
      retentionUntil: retentionUntil(endedAt),
    })
    .onConflictDoNothing();
}

export async function recordOperationalSignal(
  signal: string,
  evidence: Record<string, unknown>,
  scope: { workspaceId?: string | null; brandId?: string | null } = {},
) {
  const now = new Date();
  const id = crypto.randomUUID();
  await getDb().insert(agentTraceSpans).values({
    workspaceId: scope.workspaceId ?? null,
    brandId: scope.brandId ?? null,
    traceId: `signal:${signal}:${now.toISOString().slice(0, 13)}`,
    spanKey: `signal:${id}`,
    spanType: "security_signal",
    name: signal,
    status: "signal",
    redactedInput: redactedRecord(evidence),
    retentionUntil: retentionUntil(now),
    startedAt: now,
    endedAt: now,
  });
}

export function recordOperationalSignalBestEffort(
  signal: string,
  evidence: Record<string, unknown>,
  scope?: { workspaceId?: string | null; brandId?: string | null },
) {
  return recordOperationalSignal(signal, evidence, scope).catch((error) => {
    logError("observability.signal_record_failed", {
      signal,
      error: error instanceof Error ? error.message.slice(0, 500) : "Unknown error",
    });
  });
}

export async function listTraceSpans(
  scope: BrandScope,
  filter: { traceId?: string; actionId?: string },
) {
  return getDb()
    .select()
    .from(agentTraceSpans)
    .where(
      and(
        eq(agentTraceSpans.workspaceId, scope.workspaceId),
        eq(agentTraceSpans.brandId, scope.brandId),
        or(
          filter.traceId ? eq(agentTraceSpans.traceId, filter.traceId) : undefined,
          filter.actionId ? eq(agentTraceSpans.actionId, filter.actionId) : undefined,
        ),
      ),
    )
    .orderBy(asc(agentTraceSpans.startedAt))
    .limit(500);
}

export async function purgeExpiredTraceSpans(now = new Date()) {
  const deleted = await getDb()
    .delete(agentTraceSpans)
    .where(lte(agentTraceSpans.retentionUntil, now))
    .returning({ id: agentTraceSpans.id });
  return deleted.length;
}
