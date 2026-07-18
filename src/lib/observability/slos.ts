import {
  and,
  count,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  agentActionLedger,
  agentAutonomyRolloutEvents,
  agentAutonomyRollouts,
  agentLlmCalls,
  agentOperationalIncidents,
  agentScheduledWork,
  agentStepExecutions,
  agentTraceSpans,
  creditLedger,
  publicationGateRuns,
} from "@/lib/db/schema";
import { logError, logInfo } from "@/lib/logging/logger";

export const SLO_KEYS = [
  "scheduled_fanout_completeness",
  "workflow_completion",
  "recovery_latency",
  "duplicate_side_effects",
  "action_verification",
  "rollback_success",
  "llm_availability",
  "callback_auth_failures",
  "cross_tenant_denials",
  "audit_completeness",
  "content_gate_health",
  "unexpected_spend",
] as const;

export type SloKey = (typeof SLO_KEYS)[number];
export type SloSeverity = "warning" | "high" | "critical";

export const SLO_DEFINITIONS: Record<
  SloKey,
  {
    title: string;
    objective: string;
    owner: string;
    severity: SloSeverity;
    runbookPath: string;
    replayPath?: string;
  }
> = {
  scheduled_fanout_completeness: {
    title: "Scheduled fan-out missed its completion window",
    objective: "100% of expected scheduled work is enqueued or completed within two hours.",
    owner: "agent-platform-oncall",
    severity: "high",
    runbookPath: "/docs/runbooks/claudia-operations.md#scheduled-fan-out",
    replayPath: "/api/agent/operations/replay",
  },
  workflow_completion: {
    title: "Workflow completion error budget exceeded",
    objective: "At least 98% of terminal steps complete without permanent failure per hour.",
    owner: "agent-platform-oncall",
    severity: "high",
    runbookPath: "/docs/runbooks/claudia-operations.md#workflow-completion-and-recovery",
  },
  recovery_latency: {
    title: "Retryable work has not recovered",
    objective: "Retryable steps recover or escalate within 30 minutes.",
    owner: "agent-platform-oncall",
    severity: "high",
    runbookPath: "/docs/runbooks/claudia-operations.md#workflow-completion-and-recovery",
  },
  duplicate_side_effects: {
    title: "A duplicate remote side effect was detected",
    objective: "Zero duplicate billing or remote mutations.",
    owner: "agent-security-oncall",
    severity: "critical",
    runbookPath: "/docs/runbooks/claudia-operations.md#duplicate-side-effects",
  },
  action_verification: {
    title: "A remote action is unverified",
    objective: "100% of remote actions verify within 30 minutes.",
    owner: "agent-platform-oncall",
    severity: "critical",
    runbookPath: "/docs/runbooks/claudia-operations.md#verification-and-rollback",
  },
  rollback_success: {
    title: "An advertised rollback did not complete",
    objective: "At least 99% rollback success, with no silent failure.",
    owner: "agent-platform-oncall",
    severity: "critical",
    runbookPath: "/docs/runbooks/claudia-operations.md#verification-and-rollback",
  },
  llm_availability: {
    title: "LLM provider availability degraded",
    objective: "At least 95% successful model calls in each 15-minute window.",
    owner: "agent-platform-oncall",
    severity: "high",
    runbookPath: "/docs/runbooks/claudia-operations.md#llm-provider",
  },
  callback_auth_failures: {
    title: "Workflow callback authentication failures spiked",
    objective: "Fewer than 20 denied callbacks per 15-minute window.",
    owner: "agent-security-oncall",
    severity: "high",
    runbookPath: "/docs/runbooks/claudia-operations.md#callback-authentication",
  },
  cross_tenant_denials: {
    title: "Cross-tenant access was attempted",
    objective: "Zero cross-tenant resource attempts.",
    owner: "agent-security-oncall",
    severity: "critical",
    runbookPath: "/docs/runbooks/claudia-operations.md#cross-tenant-denials",
  },
  audit_completeness: {
    title: "A production action is missing its trace",
    objective: "100% of material actions have an action trace span.",
    owner: "agent-platform-oncall",
    severity: "critical",
    runbookPath: "/docs/runbooks/claudia-operations.md#audit-completeness",
  },
  content_gate_health: {
    title: "A required content gate errored",
    objective: "Zero gate infrastructure errors; ordinary content rejection remains fail-closed.",
    owner: "content-safety-oncall",
    severity: "high",
    runbookPath: "/docs/runbooks/claudia-operations.md#content-gates",
  },
  unexpected_spend: {
    title: "Agent credit spend exceeded its operational ceiling",
    objective: "No more than the configured hourly credit ceiling.",
    owner: "agent-platform-oncall",
    severity: "critical",
    runbookPath: "/docs/runbooks/claudia-operations.md#unexpected-spend",
  },
};

export type OperationalSloSnapshot = {
  scheduledPastSlo: number;
  terminalSteps: number;
  permanentlyFailedSteps: number;
  oldestRetryableAgeMs: number;
  duplicateSignals: number;
  unverifiedActions: number;
  rollbackFailures: number;
  llmCalls: number;
  llmFailures: number;
  callbackAuthFailures: number;
  crossTenantDenials: number;
  actions: number;
  actionsMissingTrace: number;
  contentGateErrors: number;
  creditsSpent: number;
  hourlyCreditCeiling: number;
};

export type SloObservation = {
  key: SloKey;
  breached: boolean;
  value: number;
  threshold: number;
  detail: string;
};

/** Pure threshold logic used by both the cron monitor and focused tests. */
export function assessOperationalSlos(snapshot: OperationalSloSnapshot): SloObservation[] {
  const workflowFailureRate =
    snapshot.terminalSteps === 0
      ? 0
      : snapshot.permanentlyFailedSteps / snapshot.terminalSteps;
  const llmFailureRate =
    snapshot.llmCalls === 0 ? 0 : snapshot.llmFailures / snapshot.llmCalls;
  const auditMissingRate =
    snapshot.actions === 0 ? 0 : snapshot.actionsMissingTrace / snapshot.actions;

  return [
    {
      key: "scheduled_fanout_completeness",
      breached: snapshot.scheduledPastSlo > 0,
      value: snapshot.scheduledPastSlo,
      threshold: 0,
      detail: `${snapshot.scheduledPastSlo} scheduled items are older than two hours.`,
    },
    {
      key: "workflow_completion",
      breached: snapshot.terminalSteps >= 5 && workflowFailureRate > 0.02,
      value: workflowFailureRate,
      threshold: 0.02,
      detail: `${snapshot.permanentlyFailedSteps}/${snapshot.terminalSteps} terminal steps permanently failed.`,
    },
    {
      key: "recovery_latency",
      breached: snapshot.oldestRetryableAgeMs > 30 * 60_000,
      value: snapshot.oldestRetryableAgeMs,
      threshold: 30 * 60_000,
      detail: `Oldest retryable work is ${Math.round(snapshot.oldestRetryableAgeMs / 60_000)} minutes old.`,
    },
    {
      key: "duplicate_side_effects",
      breached: snapshot.duplicateSignals > 0,
      value: snapshot.duplicateSignals,
      threshold: 0,
      detail: `${snapshot.duplicateSignals} explicit duplicate-side-effect signals were recorded.`,
    },
    {
      key: "action_verification",
      breached: snapshot.unverifiedActions > 0,
      value: snapshot.unverifiedActions,
      threshold: 0,
      detail: `${snapshot.unverifiedActions} actions failed verification or remained pending past 30 minutes.`,
    },
    {
      key: "rollback_success",
      breached: snapshot.rollbackFailures > 0,
      value: snapshot.rollbackFailures,
      threshold: 0,
      detail: `${snapshot.rollbackFailures} rollback actions require recovery.`,
    },
    {
      key: "llm_availability",
      breached:
        (snapshot.llmCalls >= 5 && llmFailureRate > 0.05) || snapshot.llmFailures >= 5,
      value: llmFailureRate,
      threshold: 0.05,
      detail: `${snapshot.llmFailures}/${snapshot.llmCalls} LLM calls failed.`,
    },
    {
      key: "callback_auth_failures",
      breached: snapshot.callbackAuthFailures >= 20,
      value: snapshot.callbackAuthFailures,
      threshold: 19,
      detail: `${snapshot.callbackAuthFailures} callback authentication failures occurred.`,
    },
    {
      key: "cross_tenant_denials",
      breached: snapshot.crossTenantDenials > 0,
      value: snapshot.crossTenantDenials,
      threshold: 0,
      detail: `${snapshot.crossTenantDenials} cross-tenant attempts were denied.`,
    },
    {
      key: "audit_completeness",
      breached: snapshot.actionsMissingTrace > 0,
      value: auditMissingRate,
      threshold: 0,
      detail: `${snapshot.actionsMissingTrace}/${snapshot.actions} actions are missing trace spans.`,
    },
    {
      key: "content_gate_health",
      breached: snapshot.contentGateErrors > 0,
      value: snapshot.contentGateErrors,
      threshold: 0,
      detail: `${snapshot.contentGateErrors} content gate runs ended in infrastructure error.`,
    },
    {
      key: "unexpected_spend",
      breached: snapshot.creditsSpent > snapshot.hourlyCreditCeiling,
      value: snapshot.creditsSpent,
      threshold: snapshot.hourlyCreditCeiling,
      detail: `${snapshot.creditsSpent} credits were spent in the last hour.`,
    },
  ];
}

function numeric(value: unknown) {
  return Number(value ?? 0);
}

export async function gatherOperationalSloSnapshot(
  now = new Date(),
): Promise<OperationalSloSnapshot> {
  const db = getDb();
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60_000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60_000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);

  const [
    scheduled,
    terminal,
    oldestRetryable,
    duplicateSignals,
    verification,
    rollback,
    llm,
    securitySignals,
    audit,
    gates,
    spend,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(agentScheduledWork)
      .where(
        and(
          inArray(agentScheduledWork.status, [
            "expected",
            "enqueue_failed",
            "enqueued",
            "running",
          ]),
          lt(agentScheduledWork.createdAt, twoHoursAgo),
        ),
      ),
    db
      .select({
        total: count(),
        failed: sql<number>`count(*) filter (where ${agentStepExecutions.status} = 'permanent_failure')`,
      })
      .from(agentStepExecutions)
      .where(
        and(
          gte(agentStepExecutions.updatedAt, hourAgo),
          inArray(agentStepExecutions.status, [
            "completed",
            "completed_degraded",
            "permanent_failure",
          ]),
        ),
      ),
    db
      .select({ oldest: sql<Date | null>`min(${agentStepExecutions.updatedAt})` })
      .from(agentStepExecutions)
      .where(eq(agentStepExecutions.status, "retryable")),
    db
      .select({ value: count() })
      .from(agentTraceSpans)
      .where(
        and(
          eq(agentTraceSpans.spanType, "security_signal"),
          eq(agentTraceSpans.name, "duplicate_side_effect"),
          gte(agentTraceSpans.startedAt, hourAgo),
        ),
      ),
    db
      .select({ value: count() })
      .from(agentActionLedger)
      .where(
        and(
          gte(agentActionLedger.createdAt, hourAgo),
          sql`(${agentActionLedger.verificationStatus} = 'failed' or (${agentActionLedger.verificationStatus} = 'pending' and ${agentActionLedger.createdAt} < ${thirtyMinutesAgo}))`,
        ),
      ),
    db
      .select({ value: count() })
      .from(agentActionLedger)
      .where(
        and(
          gte(agentActionLedger.updatedAt, hourAgo),
          inArray(agentActionLedger.status, ["rollback_failed", "manual_recovery_required"]),
        ),
      ),
    db
      .select({
        total: count(),
        failed: sql<number>`count(*) filter (where ${agentLlmCalls.status} = 'failed')`,
      })
      .from(agentLlmCalls)
      .where(gte(agentLlmCalls.createdAt, fifteenMinutesAgo)),
    db
      .select({ name: agentTraceSpans.name, value: count() })
      .from(agentTraceSpans)
      .where(
        and(
          eq(agentTraceSpans.spanType, "security_signal"),
          inArray(agentTraceSpans.name, ["callback_auth_failure", "cross_tenant_denied"]),
          gte(agentTraceSpans.startedAt, fifteenMinutesAgo),
        ),
      )
      .groupBy(agentTraceSpans.name),
    db
      .select({
        total: count(),
        missing: sql<number>`count(*) filter (where ${agentTraceSpans.id} is null)`,
      })
      .from(agentActionLedger)
      .leftJoin(agentTraceSpans, eq(agentTraceSpans.actionId, agentActionLedger.id))
      .where(gte(agentActionLedger.createdAt, hourAgo)),
    db
      .select({ value: count() })
      .from(publicationGateRuns)
      .where(
        and(
          gte(publicationGateRuns.createdAt, hourAgo),
          eq(publicationGateRuns.status, "error"),
        ),
      ),
    db
      .select({
        value: sql<number>`coalesce(-sum(case when ${creditLedger.delta} < 0 then ${creditLedger.delta} else 0 end), 0)`,
      })
      .from(creditLedger)
      .where(gte(creditLedger.createdAt, hourAgo)),
  ]);

  const security = new Map(securitySignals.map((row) => [row.name, numeric(row.value)]));
  const oldest = oldestRetryable[0]?.oldest;
  return {
    scheduledPastSlo: numeric(scheduled[0]?.value),
    terminalSteps: numeric(terminal[0]?.total),
    permanentlyFailedSteps: numeric(terminal[0]?.failed),
    oldestRetryableAgeMs: oldest ? Math.max(0, now.getTime() - new Date(oldest).getTime()) : 0,
    duplicateSignals: numeric(duplicateSignals[0]?.value),
    unverifiedActions: numeric(verification[0]?.value),
    rollbackFailures: numeric(rollback[0]?.value),
    llmCalls: numeric(llm[0]?.total),
    llmFailures: numeric(llm[0]?.failed),
    callbackAuthFailures: security.get("callback_auth_failure") ?? 0,
    crossTenantDenials: security.get("cross_tenant_denied") ?? 0,
    actions: numeric(audit[0]?.total),
    actionsMissingTrace: numeric(audit[0]?.missing),
    contentGateErrors: numeric(gates[0]?.value),
    creditsSpent: numeric(spend[0]?.value),
    hourlyCreditCeiling: Math.max(
      1,
      Number(process.env.CLAUDIA_HOURLY_CREDIT_ALERT_THRESHOLD ?? 1_000),
    ),
  };
}

async function upsertIncident(observation: SloObservation, now: Date) {
  const definition = SLO_DEFINITIONS[observation.key];
  const fingerprint = `slo:${observation.key}`;
  const [incident] = await getDb()
    .insert(agentOperationalIncidents)
    .values({
      fingerprint,
      sloKey: observation.key,
      severity: definition.severity,
      owner: definition.owner,
      title: definition.title,
      detail: observation.detail,
      evidence: {
        value: observation.value,
        threshold: observation.threshold,
        objective: definition.objective,
      },
      runbookPath: definition.runbookPath,
      replayPath: definition.replayPath ?? null,
      firstObservedAt: now,
      lastObservedAt: now,
    })
    .onConflictDoUpdate({
      target: agentOperationalIncidents.fingerprint,
      targetWhere: sql`status in ('open','acknowledged')`,
      set: {
        severity: definition.severity,
        detail: observation.detail,
        evidence: {
          value: observation.value,
          threshold: observation.threshold,
          objective: definition.objective,
        },
        occurrenceCount: sql`${agentOperationalIncidents.occurrenceCount} + 1`,
        lastObservedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  if (!incident) throw new Error(`Incident ${fingerprint} could not be recorded`);
  logError("claudia.slo_breached", {
    incidentId: incident.id,
    sloKey: observation.key,
    severity: definition.severity,
    owner: definition.owner,
    value: observation.value,
    threshold: observation.threshold,
    runbookPath: definition.runbookPath,
    replayPath: definition.replayPath ?? null,
  });
  return incident;
}

async function resolveHealthyIncident(key: SloKey, now: Date) {
  await getDb()
    .update(agentOperationalIncidents)
    .set({
      status: "resolved",
      resolvedAt: now,
      resolution: "The subsequent SLO evaluation returned to the objective.",
      updatedAt: now,
    })
    .where(
      and(
        eq(agentOperationalIncidents.fingerprint, `slo:${key}`),
        inArray(agentOperationalIncidents.status, ["open", "acknowledged"]),
      ),
    );
}

async function pauseRolloutsForOperationalStops(
  breached: SloObservation[],
  now: Date,
) {
  if (breached.length === 0) return 0;
  return getDb().transaction(async (tx) => {
    const rollouts = await tx
      .select()
      .from(agentAutonomyRollouts)
      .where(eq(agentAutonomyRollouts.status, "active"))
      .for("update");
    let paused = 0;
    for (const rollout of rollouts) {
      const policy = rollout.stopConditions as {
        pauseOnAnyCriticalIncident?: unknown;
        sloKeys?: unknown;
      };
      if (
        typeof policy.pauseOnAnyCriticalIncident !== "boolean" ||
        !Array.isArray(policy.sloKeys) ||
        !policy.sloKeys.every((key) => typeof key === "string")
      ) {
        continue;
      }
      const configured = new Set(policy.sloKeys as string[]);
      const stop = breached.find(
        (observation) =>
          configured.has(observation.key) ||
          (policy.pauseOnAnyCriticalIncident &&
            SLO_DEFINITIONS[observation.key].severity === "critical"),
      );
      if (!stop) continue;
      const reason = `Operational stop condition ${stop.key} breached: ${stop.detail}`;
      const [updated] = await tx
        .update(agentAutonomyRollouts)
        .set({
          status: "paused",
          revision: rollout.revision + 1,
          pausedAt: now,
          pauseReason: reason,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentAutonomyRollouts.id, rollout.id),
            eq(agentAutonomyRollouts.status, "active"),
            eq(agentAutonomyRollouts.revision, rollout.revision),
          ),
        )
        .returning();
      if (!updated) continue;
      await tx.insert(agentAutonomyRolloutEvents).values({
        rolloutId: rollout.id,
        workspaceId: rollout.workspaceId,
        brandId: rollout.brandId,
        eventType: "paused",
        fromStatus: rollout.status,
        toStatus: updated.status,
        fromStage: rollout.rolloutStage,
        toStage: updated.rolloutStage,
        fromLevel: rollout.autonomyLevel,
        toLevel: updated.autonomyLevel,
        fromCohortPercent: rollout.cohortPercent,
        toCohortPercent: updated.cohortPercent,
        reason,
        evidenceRefs: [`incident:slo:${stop.key}`],
        owner: SLO_DEFINITIONS[stop.key].owner,
        createdAt: now,
      });
      paused += 1;
    }
    return paused;
  });
}

export async function evaluateOperationalSlos(now = new Date()) {
  const snapshot = await gatherOperationalSloSnapshot(now);
  const observations = assessOperationalSlos(snapshot);
  const breached = observations.filter((observation) => observation.breached);
  await Promise.all(
    observations.map((observation) =>
      observation.breached
        ? upsertIncident(observation, now)
        : resolveHealthyIncident(observation.key, now),
    ),
  );
  const pausedRollouts = await pauseRolloutsForOperationalStops(breached, now);
  logInfo("claudia.slo_evaluated", {
    evaluated: observations.length,
    breached: breached.length,
    breachedKeys: breached.map((observation) => observation.key),
    pausedRollouts,
  });
  return { snapshot, observations, breached, pausedRollouts };
}

export async function listOperationalIncidents(options: {
  workspaceId: string;
  brandId: string;
  includeGlobal?: boolean;
}) {
  return getDb()
    .select()
    .from(agentOperationalIncidents)
    .where(
      and(
        inArray(agentOperationalIncidents.status, ["open", "acknowledged"]),
        options.includeGlobal
          ? sql`(${agentOperationalIncidents.workspaceId} is null or (${agentOperationalIncidents.workspaceId} = ${options.workspaceId} and (${agentOperationalIncidents.brandId} is null or ${agentOperationalIncidents.brandId} = ${options.brandId})))`
          : and(
              eq(agentOperationalIncidents.workspaceId, options.workspaceId),
              eq(agentOperationalIncidents.brandId, options.brandId),
            ),
      ),
    );
}
