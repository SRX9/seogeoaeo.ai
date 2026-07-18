import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BrandScope } from "@/lib/brand/repository";
import {
  CONNECTOR_MUTATION_PROTOCOL_VERSION,
  isConnectorCapabilityCertified,
  validateConnectorCertificationEvidence,
  validateConnectorSiteActivationEvidence,
} from "@/lib/connectors/certification";
import {
  DEFAULT_CONNECTOR_LIMITS,
  assertConnectorMutationTransition,
  canonicalConnectorJson,
  type ConnectorMutationStatus,
} from "@/lib/connectors/protocol";
import { fingerprintWordPressIntegration } from "@/lib/connectors/wordpress";
import { getDb } from "@/lib/db";
import {
  agentActionLedger,
  agentAutonomyDecisions,
  agentAutonomyRollouts,
  agentEvents,
  agentOperationalIncidents,
  agentStepExecutions,
  agentTraceSpans,
  connectorActivations,
  connectorCertifications,
  connectorCircuitBreakers,
  connectorMutationEvents,
  connectorMutations,
  integrations,
} from "@/lib/db/schema";

export const WORDPRESS_ARTICLE_META_ADAPTER_VERSION = "wordpress-companion-v1";

export class ConnectorGuardrailError extends Error {
  constructor(
    readonly code:
      | "certification_missing"
      | "circuit_open"
      | "brand_daily_limit"
      | "workspace_monthly_limit"
      | "resource_cooldown"
      | "resource_limit"
      | "autonomy_rollout_missing"
      | "autonomy_rollout_changed"
      | "autonomy_action_limit"
      | "autonomy_stop_condition",
    message: string,
  ) {
    super(message);
    this.name = "ConnectorGuardrailError";
  }
}

export async function getConnectorCertification(
  provider: string,
  capability: string,
  adapterVersion = WORDPRESS_ARTICLE_META_ADAPTER_VERSION,
  protocolVersion = CONNECTOR_MUTATION_PROTOCOL_VERSION,
) {
  const [row] = await getDb()
    .select()
    .from(connectorCertifications)
    .where(
      and(
        eq(connectorCertifications.provider, provider),
        eq(connectorCertifications.capability, capability),
        eq(connectorCertifications.adapterVersion, adapterVersion),
        eq(connectorCertifications.protocolVersion, protocolVersion),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Trusted operator boundary: incomplete evidence can never activate a capability. */
export async function certifyConnectorCapability(input: {
  provider: string;
  capability: string;
  adapterVersion: string;
  evidence: unknown;
  reversible: boolean;
}) {
  const validation = validateConnectorCertificationEvidence(input.evidence);
  if (!validation.valid) {
    throw new Error(
      `Connector certification evidence is incomplete: ${validation.missing.join(", ")}`,
    );
  }
  const now = new Date();
  const [row] = await getDb()
    .update(connectorCertifications)
    .set({
      status: "certified",
      reversible: input.reversible,
      evidence: validation.evidence,
      certifiedAt: now,
      revokedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(connectorCertifications.provider, input.provider),
        eq(connectorCertifications.capability, input.capability),
        eq(connectorCertifications.adapterVersion, input.adapterVersion),
        eq(
          connectorCertifications.protocolVersion,
          CONNECTOR_MUTATION_PROTOCOL_VERSION,
        ),
        inArray(connectorCertifications.status, ["candidate", "suspended"]),
      ),
    )
    .returning();
  if (!row) throw new Error("Connector certification candidate was not found");
  return row;
}

export async function suspendConnectorCertification(
  provider: string,
  capability: string,
  adapterVersion: string,
) {
  const [row] = await getDb()
    .update(connectorCertifications)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(
      and(
        eq(connectorCertifications.provider, provider),
        eq(connectorCertifications.capability, capability),
        eq(connectorCertifications.adapterVersion, adapterVersion),
        eq(
          connectorCertifications.protocolVersion,
          CONNECTOR_MUTATION_PROTOCOL_VERSION,
        ),
        eq(connectorCertifications.status, "certified"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getConnectorActivation(
  scope: BrandScope,
  integrationId: string,
  certificationId: string,
) {
  const [row] = await getDb()
    .select()
    .from(connectorActivations)
    .where(
      and(
        eq(connectorActivations.workspaceId, scope.workspaceId),
        eq(connectorActivations.brandId, scope.brandId),
        eq(connectorActivations.integrationId, integrationId),
        eq(connectorActivations.certificationId, certificationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Trusted operator boundary for one installed site. Global certification is
 * necessary but deliberately insufficient: activation also requires a full
 * evidence run bound to this exact integration.
 */
export async function activateConnectorSite(input: {
  scope: BrandScope;
  integrationId: string;
  certificationId: string;
  evidence: unknown;
}) {
  const validation = validateConnectorSiteActivationEvidence(input.evidence);
  if (!validation.valid) {
    throw new Error(
      `Connector site activation evidence is incomplete: ${validation.missing.join(", ")}`,
    );
  }

  const now = new Date();
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`connector:activation:${input.integrationId}:${input.certificationId}`}))`,
    );

    const [[integration], [certification]] = await Promise.all([
      tx
        .select()
        .from(integrations)
        .where(
          and(
            eq(integrations.id, input.integrationId),
            eq(integrations.workspaceId, input.scope.workspaceId),
            eq(integrations.brandId, input.scope.brandId),
          ),
        )
        .limit(1),
      tx
        .select()
        .from(connectorCertifications)
        .where(eq(connectorCertifications.id, input.certificationId))
        .limit(1),
    ]);

    if (!integration) throw new Error("Tenant integration was not found");
    if (!integration.enabled) {
      throw new Error("Tenant integration is not enabled");
    }
    if (
      !certification ||
      certification.provider !== integration.provider ||
      certification.capability !== "article.meta.update" ||
      certification.adapterVersion !== WORDPRESS_ARTICLE_META_ADAPTER_VERSION ||
      !isConnectorCapabilityCertified({
        certification,
        provider: certification.provider,
        capability: certification.capability,
        adapterVersion: certification.adapterVersion,
      })
    ) {
      throw new Error(
        "The exact connector capability must be globally certified before site activation",
      );
    }

    let config: { siteUrl?: unknown; username?: unknown };
    try {
      config = integration.configJson
        ? (JSON.parse(integration.configJson) as typeof config)
        : {};
    } catch {
      throw new Error("The WordPress integration configuration is invalid");
    }
    if (
      typeof config.siteUrl !== "string" ||
      typeof config.username !== "string"
    ) {
      throw new Error("The WordPress integration binding is incomplete");
    }
    const bindingIdentity = await fingerprintWordPressIntegration({
      integrationId: integration.id,
      siteUrl: config.siteUrl,
      username: config.username,
      adapterVersion: certification.adapterVersion,
    });
    if (
      validation.evidence.integrationFingerprint !== bindingIdentity.fingerprint
    ) {
      throw new Error(
        "Connector site evidence is not bound to the current WordPress integration",
      );
    }

    const [existing] = await tx
      .select()
      .from(connectorActivations)
      .where(
        and(
          eq(connectorActivations.integrationId, input.integrationId),
          eq(connectorActivations.certificationId, input.certificationId),
        ),
      )
      .limit(1);
    if (existing?.status === "revoked") {
      throw new Error("A revoked connector site activation cannot be reactivated");
    }

    if (existing) {
      const [updated] = await tx
        .update(connectorActivations)
        .set({
          status: "active",
          evidence: validation.evidence,
          statusReason: null,
          activatedAt: now,
          suspendedAt: null,
          revokedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(connectorActivations.id, existing.id),
            eq(connectorActivations.workspaceId, input.scope.workspaceId),
            eq(connectorActivations.brandId, input.scope.brandId),
            inArray(connectorActivations.status, ["candidate", "active", "suspended"]),
          ),
        )
        .returning();
      if (!updated) throw new Error("Connector site activation changed concurrently");
      return updated;
    }

    const [created] = await tx
      .insert(connectorActivations)
      .values({
        workspaceId: input.scope.workspaceId,
        brandId: input.scope.brandId,
        integrationId: input.integrationId,
        certificationId: input.certificationId,
        status: "active",
        evidence: validation.evidence,
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!created) throw new Error("Connector site activation could not be created");
    return created;
  });
}

/** Trusted operator boundary for disabling live writes to one tenant site. */
export async function suspendConnectorActivation(
  scope: BrandScope,
  integrationId: string,
  certificationId: string,
  reason: string,
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("A connector site suspension reason is required");
  }
  const now = new Date();
  const [row] = await getDb()
    .update(connectorActivations)
    .set({
      status: "suspended",
      statusReason: normalizedReason.slice(0, 2_000),
      suspendedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(connectorActivations.workspaceId, scope.workspaceId),
        eq(connectorActivations.brandId, scope.brandId),
        eq(connectorActivations.integrationId, integrationId),
        eq(connectorActivations.certificationId, certificationId),
        eq(connectorActivations.status, "active"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getConnectorMutation(scope: BrandScope, mutationId: string) {
  const [row] = await getDb()
    .select()
    .from(connectorMutations)
    .where(
      and(
        eq(connectorMutations.id, mutationId),
        eq(connectorMutations.workspaceId, scope.workspaceId),
        eq(connectorMutations.brandId, scope.brandId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getConnectorMutationByIdempotency(
  scope: BrandScope,
  idempotencyKey: string,
) {
  const [row] = await getDb()
    .select()
    .from(connectorMutations)
    .where(
      and(
        eq(connectorMutations.workspaceId, scope.workspaceId),
        eq(connectorMutations.brandId, scope.brandId),
        eq(connectorMutations.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return row ?? null;
}

type MutationProposal = {
  taskId?: string | null;
  approvalId?: string | null;
  provider: string;
  capability: string;
  adapterVersion: string;
  resourceRef: string;
  remoteResourceId: string;
  idempotencyKey: string;
  proposalHash: string;
  beforeState: Record<string, unknown>;
  proposedState: Record<string, unknown>;
  intendedDiff: unknown[];
  beforeFingerprint: string;
  expectedAfterFingerprint: string;
  policyDecision: Record<string, unknown>;
  certificationId: string;
  beforeRevision?: string | null;
  autonomy?: {
    rolloutId: string;
    decisionId: string;
    rolloutRevision: number;
    maxActionsPerUtcDay: number;
    pauseOnAnyCriticalIncident: boolean;
    stopSloKeys: string[];
  } | null;
};

const NON_BUDGET_STATUSES = ["no_op", "blocked", "cancelled"] as const;

function utcDayStart(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function utcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function reserveConnectorMutation(
  scope: BrandScope,
  proposal: MutationProposal,
  options: {
    now?: Date;
    limits?: Partial<typeof DEFAULT_CONNECTOR_LIMITS>;
  } = {},
) {
  const now = options.now ?? new Date();
  const limits = { ...DEFAULT_CONNECTOR_LIMITS, ...options.limits };
  if (limits.maxResourcesPerAction < 1) {
    throw new ConnectorGuardrailError(
      "resource_limit",
      "Connector mutations must allow at least one resource.",
    );
  }

  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`connector:workspace:${scope.workspaceId}`}))`,
    );
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`connector:brand:${scope.brandId}`}))`,
    );

    const [existing] = await tx
      .select()
      .from(connectorMutations)
      .where(
        and(
          eq(connectorMutations.workspaceId, scope.workspaceId),
          eq(connectorMutations.brandId, scope.brandId),
          eq(connectorMutations.idempotencyKey, proposal.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return { mutation: existing, created: false, guardrail: null };

    const noOp = proposal.intendedDiff.length === 0;
    let guardrail: ConnectorGuardrailError | null = null;
    if (!noOp) {
      if (proposal.autonomy) {
        const [rollout] = await tx
          .select()
          .from(agentAutonomyRollouts)
          .where(
            and(
              eq(agentAutonomyRollouts.id, proposal.autonomy.rolloutId),
              eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
              eq(agentAutonomyRollouts.brandId, scope.brandId),
              eq(agentAutonomyRollouts.capability, proposal.capability),
            ),
          )
          .for("update")
          .limit(1);
        const [decision] = await tx
          .select({ id: agentAutonomyDecisions.id })
          .from(agentAutonomyDecisions)
          .where(
            and(
              eq(agentAutonomyDecisions.id, proposal.autonomy.decisionId),
              eq(agentAutonomyDecisions.rolloutId, proposal.autonomy.rolloutId),
              eq(agentAutonomyDecisions.workspaceId, scope.workspaceId),
              eq(agentAutonomyDecisions.brandId, scope.brandId),
              eq(agentAutonomyDecisions.proposalHash, proposal.proposalHash),
              eq(agentAutonomyDecisions.decision, "allow"),
              sql`${agentAutonomyDecisions.policySnapshot}->>'rolloutRevision' = ${String(proposal.autonomy.rolloutRevision)}`,
            ),
          )
          .limit(1);
        if (!rollout || !decision) {
          guardrail = new ConnectorGuardrailError(
            "autonomy_rollout_missing",
            "The executor could not prove a matching autonomy rollout decision.",
          );
        } else if (
          rollout.status !== "active" ||
          rollout.revision !== proposal.autonomy.rolloutRevision ||
          !["internal", "live"].includes(rollout.executionMode) ||
          rollout.observationWindowStartsAt > now ||
          rollout.observationWindowEndsAt <= now ||
          rollout.certificationId !== proposal.certificationId
        ) {
          guardrail = new ConnectorGuardrailError(
            "autonomy_rollout_changed",
            "The autonomy rollout changed before the mutation was reserved.",
          );
        }

        if (!guardrail && rollout) {
          const activeIncidents = await tx
            .select({
              id: agentOperationalIncidents.id,
              sloKey: agentOperationalIncidents.sloKey,
              severity: agentOperationalIncidents.severity,
            })
            .from(agentOperationalIncidents)
            .where(
              and(
                inArray(agentOperationalIncidents.status, ["open", "acknowledged"]),
                sql`(${agentOperationalIncidents.workspaceId} is null or (${agentOperationalIncidents.workspaceId} = ${scope.workspaceId} and (${agentOperationalIncidents.brandId} is null or ${agentOperationalIncidents.brandId} = ${scope.brandId})))`,
              ),
            );
          const stopKeys = new Set(proposal.autonomy.stopSloKeys);
          const stopIncident = activeIncidents.find(
            (incident) =>
              stopKeys.has(incident.sloKey) ||
              (proposal.autonomy?.pauseOnAnyCriticalIncident === true &&
                incident.severity === "critical"),
          );
          if (stopIncident) {
            guardrail = new ConnectorGuardrailError(
              "autonomy_stop_condition",
              `Autonomy stop condition ${stopIncident.sloKey} is active.`,
            );
          }

          const [rolloutActions] = await tx
            .select({ value: count() })
            .from(connectorMutations)
            .where(
              and(
                eq(connectorMutations.autonomyRolloutId, rollout.id),
                gte(connectorMutations.createdAt, utcDayStart(now)),
                notInArray(connectorMutations.status, [...NON_BUDGET_STATUSES]),
              ),
            );
          if (
            !guardrail &&
            (rolloutActions?.value ?? 0) >= proposal.autonomy.maxActionsPerUtcDay
          ) {
            guardrail = new ConnectorGuardrailError(
              "autonomy_action_limit",
              "The autonomy rollout reached its daily action ceiling.",
            );
          }

          if (guardrail) {
            await tx
              .update(agentAutonomyRollouts)
              .set({
                status: "paused",
                revision: sql`${agentAutonomyRollouts.revision} + 1`,
                pausedAt: now,
                pauseReason: guardrail.message,
                updatedAt: now,
              })
              .where(
                and(
                  eq(agentAutonomyRollouts.id, rollout.id),
                  eq(agentAutonomyRollouts.status, "active"),
                  eq(agentAutonomyRollouts.revision, rollout.revision),
                ),
              );
          }
        }
      }

      const [breaker] = await tx
        .select()
        .from(connectorCircuitBreakers)
        .where(
          and(
            eq(connectorCircuitBreakers.workspaceId, scope.workspaceId),
            eq(connectorCircuitBreakers.brandId, scope.brandId),
            eq(connectorCircuitBreakers.provider, proposal.provider),
            eq(connectorCircuitBreakers.capability, proposal.capability),
            eq(connectorCircuitBreakers.status, "open"),
          ),
        )
        .limit(1);
      if (!guardrail && breaker) {
        guardrail = new ConnectorGuardrailError(
          "circuit_open",
          breaker.reason ?? "Connector circuit breaker is open.",
        );
      }

      const [[brandWrites], [workspaceWrites], [related]] = await Promise.all([
        tx
          .select({ value: count() })
          .from(connectorMutations)
          .where(
            and(
              eq(connectorMutations.workspaceId, scope.workspaceId),
              eq(connectorMutations.brandId, scope.brandId),
              gte(connectorMutations.createdAt, utcDayStart(now)),
              notInArray(connectorMutations.status, [...NON_BUDGET_STATUSES]),
            ),
          ),
        tx
          .select({ value: count() })
          .from(connectorMutations)
          .where(
            and(
              eq(connectorMutations.workspaceId, scope.workspaceId),
              gte(connectorMutations.createdAt, utcMonthStart(now)),
              notInArray(connectorMutations.status, [...NON_BUDGET_STATUSES]),
            ),
          ),
        tx
          .select({ id: connectorMutations.id })
          .from(connectorMutations)
          .where(
            and(
              eq(connectorMutations.workspaceId, scope.workspaceId),
              eq(connectorMutations.brandId, scope.brandId),
              eq(connectorMutations.provider, proposal.provider),
              eq(connectorMutations.capability, proposal.capability),
              eq(connectorMutations.resourceRef, proposal.resourceRef),
              ne(connectorMutations.idempotencyKey, proposal.idempotencyKey),
              notInArray(connectorMutations.status, [...NON_BUDGET_STATUSES]),
              or(
                isNull(connectorMutations.settledAt),
                gte(
                  connectorMutations.settledAt,
                  new Date(now.getTime() - limits.relatedResourceCooldownMs),
                ),
              ),
            ),
          )
          .limit(1),
      ]);

      if (!guardrail && (brandWrites?.value ?? 0) >= limits.maxBrandWritesPerUtcDay) {
        guardrail = new ConnectorGuardrailError(
          "brand_daily_limit",
          "This brand has reached its daily live-write limit.",
        );
      }
      if (
        !guardrail &&
        (workspaceWrites?.value ?? 0) >= limits.maxWorkspaceWritesPerUtcMonth
      ) {
        guardrail = new ConnectorGuardrailError(
          "workspace_monthly_limit",
          "This workspace has reached its monthly live-write limit.",
        );
      }
      if (!guardrail && related) {
        guardrail = new ConnectorGuardrailError(
          "resource_cooldown",
          "A related mutation is still inside its safety cooldown.",
        );
      }
    }

    const status: ConnectorMutationStatus = noOp
      ? "no_op"
      : guardrail
        ? "blocked"
        : "prepared";
    const [mutation] = await tx
      .insert(connectorMutations)
      .values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        taskId: proposal.taskId ?? null,
        approvalId: proposal.approvalId ?? null,
        autonomyRolloutId: proposal.autonomy?.rolloutId ?? null,
        autonomyDecisionId: proposal.autonomy?.decisionId ?? null,
        autonomyRolloutRevision: proposal.autonomy?.rolloutRevision ?? null,
        provider: proposal.provider,
        capability: proposal.capability,
        adapterVersion: proposal.adapterVersion,
        protocolVersion: CONNECTOR_MUTATION_PROTOCOL_VERSION,
        resourceRef: proposal.resourceRef,
        remoteResourceId: proposal.remoteResourceId,
        idempotencyKey: proposal.idempotencyKey,
        proposalHash: proposal.proposalHash,
        beforeState: proposal.beforeState,
        proposedState: proposal.proposedState,
        intendedDiff: proposal.intendedDiff,
        beforeFingerprint: proposal.beforeFingerprint,
        expectedAfterFingerprint: proposal.expectedAfterFingerprint,
        policyDecision: proposal.policyDecision,
        certificationId: proposal.certificationId,
        resourceCount: 1,
        isCanary: true,
        status,
        verificationStatus: noOp ? "verified" : "pending",
        rollbackStatus: "not_required",
        failure: guardrail
          ? { code: guardrail.code, message: guardrail.message, retryable: false }
          : null,
        beforeRevision: proposal.beforeRevision ?? null,
        verifiedAt: noOp ? now : null,
        settledAt: noOp || guardrail ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!mutation) throw new Error("Connector mutation could not be reserved");
    await tx.insert(connectorMutationEvents).values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      mutationId: mutation.id,
      eventType: noOp ? "no_change" : guardrail ? "blocked" : "prepared",
      status,
      detail: guardrail
        ? { code: guardrail.code, reason: guardrail.message }
        : { isCanary: true, resourceCount: 1 },
      createdAt: now,
    });
    return { mutation, created: true, guardrail };
  });
}

type MutableMutationPatch = {
  verificationStatus?: string;
  rollbackStatus?: string;
  result?: Record<string, unknown> | null;
  rollbackHandle?: Record<string, unknown> | null;
  failure?: Record<string, unknown> | null;
  appliedRevision?: string | null;
  verifiedRevision?: string | null;
  revertedRevision?: string | null;
  actionId?: string | null;
  appliedAt?: Date | null;
  verifiedAt?: Date | null;
  rollbackStartedAt?: Date | null;
  revertedAt?: Date | null;
  settledAt?: Date | null;
};

export async function transitionConnectorMutation(
  scope: BrandScope,
  mutationId: string,
  input: {
    from: readonly ConnectorMutationStatus[];
    to: ConnectorMutationStatus;
    eventType: string;
    detail?: Record<string, unknown>;
    patch?: MutableMutationPatch;
    now?: Date;
  },
) {
  for (const status of input.from) assertConnectorMutationTransition(status, input.to);
  const now = input.now ?? new Date();
  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(connectorMutations)
      .set({ ...input.patch, status: input.to, updatedAt: now })
      .where(
        and(
          eq(connectorMutations.id, mutationId),
          eq(connectorMutations.workspaceId, scope.workspaceId),
          eq(connectorMutations.brandId, scope.brandId),
          inArray(connectorMutations.status, [...input.from]),
        ),
      )
      .returning();
    if (updated) {
      await tx.insert(connectorMutationEvents).values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        mutationId,
        eventType: input.eventType,
        status: input.to,
        detail: input.detail ?? {},
        createdAt: now,
      });
      return updated;
    }
    const [current] = await tx
      .select()
      .from(connectorMutations)
      .where(
        and(
          eq(connectorMutations.id, mutationId),
          eq(connectorMutations.workspaceId, scope.workspaceId),
          eq(connectorMutations.brandId, scope.brandId),
        ),
      )
      .limit(1);
    if (!current) throw new Error("Connector mutation not found");
    if (current.status === input.to) return current;
    throw new Error(
      `Connector mutation state changed concurrently (${current.status})`,
    );
  });
}

/** Commit remote verification and its action evidence as one database fact. */
export async function verifyConnectorMutationWithAction(
  scope: BrandScope,
  mutationId: string,
  input: {
    taskId?: string | null;
    approvalId?: string | null;
    actionType: string;
    resourceRef: string;
    capability: string;
    idempotencyKey: string;
    beforeState: unknown;
    appliedChange: unknown;
    remoteRef: string;
    rollbackHandle: Record<string, unknown>;
    verificationResult: Record<string, unknown>;
    result: Record<string, unknown>;
    verifiedRevision: string;
  },
) {
  const now = new Date();
  return getDb().transaction(async (tx) => {
    let [action] = await tx
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
        remoteRef: input.remoteRef,
        rollbackHandle: input.rollbackHandle,
        status: "applied",
        verificationStatus: "verified",
        verificationResult: input.verificationResult,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [agentActionLedger.brandId, agentActionLedger.idempotencyKey],
      })
      .returning();
    const actionCreated = Boolean(action);
    if (!action) {
      [action] = await tx
        .select()
        .from(agentActionLedger)
        .where(
          and(
            eq(agentActionLedger.workspaceId, scope.workspaceId),
            eq(agentActionLedger.brandId, scope.brandId),
            eq(agentActionLedger.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
    }
    if (
      !action ||
      action.actionType !== input.actionType ||
      action.resourceRef !== input.resourceRef ||
      action.capability !== input.capability ||
      action.taskId !== (input.taskId ?? null) ||
      action.approvalId !== (input.approvalId ?? null) ||
      action.remoteRef !== input.remoteRef ||
      action.status !== "applied" ||
      action.verificationStatus !== "verified" ||
      canonicalConnectorJson(action.beforeState) !==
        canonicalConnectorJson(input.beforeState) ||
      canonicalConnectorJson(action.appliedChange) !==
        canonicalConnectorJson(input.appliedChange)
    ) {
      throw new Error("Connector action ledger identity mismatch");
    }

    const [mutation] = await tx
      .update(connectorMutations)
      .set({
        status: "verified",
        actionId: action.id,
        verificationStatus: "verified",
        result: input.result,
        verifiedRevision: input.verifiedRevision,
        verifiedAt: now,
        failure: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(connectorMutations.id, mutationId),
          eq(connectorMutations.workspaceId, scope.workspaceId),
          eq(connectorMutations.brandId, scope.brandId),
          eq(connectorMutations.status, "applied"),
        ),
      )
      .returning();
    if (!mutation) throw new Error("Connector mutation could not be verified atomically");

    // Connector proposals can exist without an Agent OS task. In that case the
    // action trigger still creates an action-root trace, but it cannot discover
    // the currently-running connector workflow until the mutation is linked to
    // the ledger row above. Re-parent that span now, in the same transaction.
    const [step] = await tx
      .select()
      .from(agentStepExecutions)
      .where(
        and(
          eq(agentStepExecutions.workspaceId, scope.workspaceId),
          eq(agentStepExecutions.brandId, scope.brandId),
          eq(agentStepExecutions.workKey, mutationId),
          eq(agentStepExecutions.status, "running"),
          sql`${agentStepExecutions.stepKey} like ${"tool:%:verify"}`,
        ),
      )
      .orderBy(desc(agentStepExecutions.createdAt))
      .limit(1);
    if (step) {
      const [parentSpan] = await tx
        .select({ id: agentTraceSpans.id, traceId: agentTraceSpans.traceId })
        .from(agentTraceSpans)
        .where(
          and(
            eq(agentTraceSpans.stepExecutionId, step.id),
            eq(agentTraceSpans.spanType, "step"),
          ),
        )
        .limit(1);
      if (parentSpan) {
        await tx
          .update(agentTraceSpans)
          .set({
            traceId: parentSpan.traceId,
            parentSpanId: parentSpan.id,
            requestId: step.leaseOwner,
            runId: step.workflowInstanceId,
            missionId: step.missionId,
            planVersionId: step.planVersionId,
            taskId: step.taskId,
            workflowInstanceId: step.workflowInstanceId,
            stepExecutionId: step.id,
            retryCount: Math.max(0, step.attemptCount - 1),
            updatedAt: now,
          })
          .where(eq(agentTraceSpans.actionId, action.id));
      }
    }

    await tx.insert(connectorMutationEvents).values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      mutationId,
      eventType: "read_back_verified",
      status: "verified",
      detail: { actionId: action.id, revision: input.verifiedRevision },
      createdAt: now,
    });
    if (actionCreated) {
      await tx.insert(agentEvents).values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        taskId: action.taskId,
        eventType: "verified",
        summary: `Verified ${input.actionType} on ${input.resourceRef}.`,
        data: { actionId: action.id, remoteRef: action.remoteRef },
        createdAt: now,
      });
    }
    return mutation;
  });
}

/** Commit compensation state and the linked action trail in one transaction. */
export async function finalizeConnectorRollback(
  scope: BrandScope,
  mutationId: string,
  input: {
    to: "reverted" | "rollback_failed" | "manual_recovery_required";
    eventType: string;
    detail: Record<string, unknown>;
    patch: MutableMutationPatch;
    summary: string;
  },
) {
  assertConnectorMutationTransition("rollback_pending", input.to);
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [mutation] = await tx
      .update(connectorMutations)
      .set({ ...input.patch, status: input.to, updatedAt: now })
      .where(
        and(
          eq(connectorMutations.id, mutationId),
          eq(connectorMutations.workspaceId, scope.workspaceId),
          eq(connectorMutations.brandId, scope.brandId),
          eq(connectorMutations.status, "rollback_pending"),
        ),
      )
      .returning();
    if (!mutation) throw new Error("Connector rollback state changed concurrently");

    await tx.insert(connectorMutationEvents).values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      mutationId,
      eventType: input.eventType,
      status: input.to,
      detail: input.detail,
      createdAt: now,
    });
    if (mutation.actionId) {
      const [action] = await tx
        .update(agentActionLedger)
        .set({
          status: input.to,
          revertedAt: input.to === "reverted" ? now : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentActionLedger.id, mutation.actionId),
            eq(agentActionLedger.workspaceId, scope.workspaceId),
            eq(agentActionLedger.brandId, scope.brandId),
          ),
        )
        .returning();
      if (!action) throw new Error("Connector rollback action ledger is missing");
      await tx.insert(agentEvents).values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        taskId: action.taskId,
        eventType: input.to === "reverted" ? "reverted" : "rollback_failed",
        summary: input.summary,
        data: { actionId: action.id, status: input.to, ...input.detail },
        createdAt: now,
      });
    }
    return mutation;
  });
}

export async function claimConnectorMutationForWrite(
  scope: BrandScope,
  mutationId: string,
) {
  const now = new Date();
  const staleAt = new Date(now.getTime() - 5 * 60 * 1_000);
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(connectorMutations)
      .where(
        and(
          eq(connectorMutations.id, mutationId),
          eq(connectorMutations.workspaceId, scope.workspaceId),
          eq(connectorMutations.brandId, scope.brandId),
        ),
      )
      .for("update")
      .limit(1);
    if (!current) throw new Error("Connector mutation not found");
    const claimable =
      current.status === "prepared" ||
      (current.status === "writing" && current.updatedAt <= staleAt);
    if (!claimable) return { mutation: current, claimed: false as const };

    if (current.autonomyRolloutId) {
      const [rollout] = await tx
        .select()
        .from(agentAutonomyRollouts)
        .where(
          and(
            eq(agentAutonomyRollouts.id, current.autonomyRolloutId),
            eq(agentAutonomyRollouts.workspaceId, scope.workspaceId),
            eq(agentAutonomyRollouts.brandId, scope.brandId),
            eq(agentAutonomyRollouts.capability, current.capability),
          ),
        )
        .for("update")
        .limit(1);
      const [decision] = current.autonomyDecisionId
        ? await tx
            .select({ id: agentAutonomyDecisions.id })
            .from(agentAutonomyDecisions)
            .where(
              and(
                eq(agentAutonomyDecisions.id, current.autonomyDecisionId),
                eq(agentAutonomyDecisions.rolloutId, current.autonomyRolloutId),
                eq(agentAutonomyDecisions.proposalHash, current.proposalHash),
                eq(agentAutonomyDecisions.decision, "allow"),
                sql`${agentAutonomyDecisions.policySnapshot}->>'rolloutRevision' = ${String(current.autonomyRolloutRevision)}`,
              ),
            )
            .limit(1)
        : [];
      const stopConditions = rollout?.stopConditions as
        | { pauseOnAnyCriticalIncident?: unknown; sloKeys?: unknown }
        | undefined;
      const validStopPolicy =
        typeof stopConditions?.pauseOnAnyCriticalIncident === "boolean" &&
        Array.isArray(stopConditions.sloKeys) &&
        stopConditions.sloKeys.every((key) => typeof key === "string");
      const incidents = await tx
        .select({
          id: agentOperationalIncidents.id,
          sloKey: agentOperationalIncidents.sloKey,
          severity: agentOperationalIncidents.severity,
        })
        .from(agentOperationalIncidents)
        .where(
          and(
            inArray(agentOperationalIncidents.status, ["open", "acknowledged"]),
            sql`(${agentOperationalIncidents.workspaceId} is null or (${agentOperationalIncidents.workspaceId} = ${scope.workspaceId} and (${agentOperationalIncidents.brandId} is null or ${agentOperationalIncidents.brandId} = ${scope.brandId})))`,
          ),
        );
      const stopKeys = new Set(
        validStopPolicy ? (stopConditions!.sloKeys as string[]) : [],
      );
      const stopIncident = incidents.find(
        (incident) =>
          stopKeys.has(incident.sloKey) ||
          (stopConditions?.pauseOnAnyCriticalIncident === true &&
            incident.severity === "critical"),
      );
      const invalidReason = !rollout
        ? "The autonomy rollout no longer exists."
        : !decision
          ? "The immutable autonomy decision cannot be verified."
          : rollout.status !== "active"
            ? rollout.pauseReason ?? `The autonomy rollout is ${rollout.status}.`
            : rollout.revision !== current.autonomyRolloutRevision
              ? "The autonomy rollout changed after this mutation was prepared."
              : !["internal", "live"].includes(rollout.executionMode)
                ? "The autonomy rollout is not allowed to execute a live connector."
                : rollout.observationWindowStartsAt > now ||
                    rollout.observationWindowEndsAt <= now
                  ? "The autonomy observation window is not active."
                  : !validStopPolicy
                    ? "The autonomy stop policy is invalid."
                    : stopIncident
                      ? `Autonomy stop condition ${stopIncident.sloKey} is active.`
                      : null;
      if (invalidReason) {
        const status =
          current.status === "writing"
            ? ("manual_recovery_required" as const)
            : ("cancelled" as const);
        const [blocked] = await tx
          .update(connectorMutations)
          .set({
            status,
            verificationStatus:
              status === "manual_recovery_required" ? "failed" : current.verificationStatus,
            rollbackStatus:
              status === "manual_recovery_required"
                ? "manual_recovery_required"
                : current.rollbackStatus,
            failure: {
              code: "autonomy_revalidation_failed",
              message: invalidReason,
              retryable: false,
            },
            settledAt: now,
            updatedAt: now,
          })
          .where(eq(connectorMutations.id, current.id))
          .returning();
        if (rollout?.status === "active") {
          await tx
            .update(agentAutonomyRollouts)
            .set({
              status: "paused",
              revision: sql`${agentAutonomyRollouts.revision} + 1`,
              pausedAt: now,
              pauseReason: invalidReason,
              updatedAt: now,
            })
            .where(
              and(
                eq(agentAutonomyRollouts.id, rollout.id),
                eq(agentAutonomyRollouts.status, "active"),
                eq(agentAutonomyRollouts.revision, rollout.revision),
              ),
            );
        }
        await tx.insert(connectorMutationEvents).values({
          workspaceId: scope.workspaceId,
          brandId: scope.brandId,
          mutationId: current.id,
          eventType: "autonomy_revalidation_failed",
          status,
          detail: { reason: invalidReason, rolloutId: current.autonomyRolloutId },
          createdAt: now,
        });
        return { mutation: blocked ?? current, claimed: false as const };
      }
    }

    const [updated] = await tx
      .update(connectorMutations)
      .set({
        status: "writing",
        attemptCount: sql`${connectorMutations.attemptCount} + 1`,
        startedAt: sql`coalesce(${connectorMutations.startedAt}, ${now})`,
        updatedAt: now,
      })
      .where(
        and(
          eq(connectorMutations.id, mutationId),
          eq(connectorMutations.workspaceId, scope.workspaceId),
          eq(connectorMutations.brandId, scope.brandId),
          or(
            eq(connectorMutations.status, "prepared"),
            and(
              eq(connectorMutations.status, "writing"),
              lte(connectorMutations.updatedAt, staleAt),
            ),
          ),
        ),
      )
      .returning();
    if (updated) {
      await tx.insert(connectorMutationEvents).values({
        workspaceId: scope.workspaceId,
        brandId: scope.brandId,
        mutationId,
        eventType: "write_started",
        status: "writing",
        detail: { attempt: updated.attemptCount },
        createdAt: now,
      });
      return { mutation: updated, claimed: true as const };
    }
    return { mutation: current, claimed: false as const };
  });
}

export async function getOpenConnectorCircuit(
  scope: BrandScope,
  provider: string,
  capability: string,
) {
  const [row] = await getDb()
    .select()
    .from(connectorCircuitBreakers)
    .where(
      and(
        eq(connectorCircuitBreakers.workspaceId, scope.workspaceId),
        eq(connectorCircuitBreakers.brandId, scope.brandId),
        eq(connectorCircuitBreakers.provider, provider),
        eq(connectorCircuitBreakers.capability, capability),
        eq(connectorCircuitBreakers.status, "open"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function openConnectorCircuit(
  scope: BrandScope,
  provider: string,
  capability: string,
  reason: string,
  source: string,
) {
  const now = new Date();
  const [row] = await getDb()
    .insert(connectorCircuitBreakers)
    .values({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      provider,
      capability,
      status: "open",
      reason: reason.slice(0, 2_000),
      source: source.slice(0, 120),
      openedAt: now,
      closedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        connectorCircuitBreakers.brandId,
        connectorCircuitBreakers.provider,
        connectorCircuitBreakers.capability,
      ],
      set: {
        status: "open",
        reason: reason.slice(0, 2_000),
        source: source.slice(0, 120),
        openedAt: now,
        closedAt: null,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Trusted operator boundary after the incident and remote state are reviewed. */
export async function closeConnectorCircuit(
  scope: BrandScope,
  provider: string,
  capability: string,
  reason: string,
) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("A connector circuit reset reason is required");
  const now = new Date();
  const [row] = await getDb()
    .update(connectorCircuitBreakers)
    .set({
      status: "closed",
      reason: `Operator reset: ${normalizedReason}`.slice(0, 2_000),
      source: "operator_reset",
      closedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(connectorCircuitBreakers.workspaceId, scope.workspaceId),
        eq(connectorCircuitBreakers.brandId, scope.brandId),
        eq(connectorCircuitBreakers.provider, provider),
        eq(connectorCircuitBreakers.capability, capability),
        eq(connectorCircuitBreakers.status, "open"),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listRecentConnectorOutcomes(
  scope: BrandScope,
  provider: string,
  capability: string,
  limit = DEFAULT_CONNECTOR_LIMITS.errorWindowSize,
) {
  const [breaker] = await getDb()
    .select({ status: connectorCircuitBreakers.status, closedAt: connectorCircuitBreakers.closedAt })
    .from(connectorCircuitBreakers)
    .where(
      and(
        eq(connectorCircuitBreakers.workspaceId, scope.workspaceId),
        eq(connectorCircuitBreakers.brandId, scope.brandId),
        eq(connectorCircuitBreakers.provider, provider),
        eq(connectorCircuitBreakers.capability, capability),
      ),
    )
    .limit(1);
  const afterOperatorReset =
    breaker?.status === "closed" && breaker.closedAt
      ? gte(connectorMutations.updatedAt, breaker.closedAt)
      : undefined;
  return getDb()
    .select({
      status: connectorMutations.status,
      verificationStatus: connectorMutations.verificationStatus,
    })
    .from(connectorMutations)
    .where(
      and(
        eq(connectorMutations.workspaceId, scope.workspaceId),
        eq(connectorMutations.brandId, scope.brandId),
        eq(connectorMutations.provider, provider),
        eq(connectorMutations.capability, capability),
        notInArray(connectorMutations.status, ["no_op", "blocked", "cancelled"]),
        afterOperatorReset,
      ),
    )
    .orderBy(desc(connectorMutations.createdAt))
    .limit(limit);
}

/** Recent live scopes eligible for the daily traffic/error safety scan. */
export async function listConnectorHealthScopes(limit = 100) {
  return getDb()
    .selectDistinct({
      workspaceId: connectorMutations.workspaceId,
      brandId: connectorMutations.brandId,
      provider: connectorMutations.provider,
      capability: connectorMutations.capability,
    })
    .from(connectorMutations)
    .where(
      and(
        inArray(connectorMutations.status, [
          "verified",
          "verification_failed",
          "rollback_failed",
          "manual_recovery_required",
          "reverted",
        ]),
        gte(
          connectorMutations.createdAt,
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000),
        ),
      ),
    )
    .limit(Math.max(1, Math.min(limit, 500)));
}

/** Mutations whose durable execution or compensation needs reconciliation. */
export async function listRecoverableConnectorMutations(limit = 25) {
  return getDb()
    .select({
      id: connectorMutations.id,
      workspaceId: connectorMutations.workspaceId,
      brandId: connectorMutations.brandId,
      status: connectorMutations.status,
    })
    .from(connectorMutations)
    .where(
      and(
        inArray(connectorMutations.status, [
          "prepared",
          "writing",
          "applied",
          "verification_failed",
          "rollback_pending",
          "rollback_failed",
        ]),
        lte(connectorMutations.updatedAt, new Date(Date.now() - 15 * 60 * 1_000)),
      ),
    )
    .orderBy(connectorMutations.updatedAt)
    .limit(Math.max(1, Math.min(limit, 100)));
}
