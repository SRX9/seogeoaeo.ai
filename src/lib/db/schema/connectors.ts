import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { agentActionLedger, agentApprovals, agentTasks } from "./agent-os";
import { agentAutonomyDecisions, agentAutonomyRollouts } from "./autonomy";
import { workspaces } from "./app";
import { brands, integrations } from "./brand";

export type ConnectorCertificationEvidence = Record<string, unknown>;
export type ConnectorActivationEvidence = Record<string, unknown>;
export type ConnectorMutationState = Record<string, unknown>;
export type ConnectorMutationDiff = Record<string, unknown> | unknown[];
export type ConnectorPolicyDecision = Record<string, unknown>;
export type ConnectorMutationResult = Record<string, unknown>;
export type ConnectorRollbackHandle = Record<string, unknown>;
export type ConnectorMutationFailure = Record<string, unknown>;
export type ConnectorMutationEventDetail = Record<string, unknown>;

/**
 * Global certification gate for one exact provider capability and adapter
 * protocol pair. A row being present does not grant authority: only the
 * `certified` status may be considered executable by the connector boundary.
 */
export const connectorCertifications = pgTable(
  "connector_certifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    capability: text("capability").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    protocolVersion: text("protocol_version").notNull(),
    status: text("status").notNull().default("candidate"),
    reversible: boolean("reversible").notNull().default(false),
    evidence: jsonb("evidence")
      .$type<ConnectorCertificationEvidence>()
      .notNull()
      .default({}),
    certifiedAt: timestamp("certified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "connector_certifications_status_check",
      sql`${table.status} in ('candidate','certified','suspended','revoked')`,
    ),
    check(
      "connector_certifications_evidence_check",
      sql`jsonb_typeof(${table.evidence}) = 'object'`,
    ),
    check(
      "connector_certifications_certified_at_check",
      sql`${table.status} <> 'certified' or ${table.certifiedAt} is not null`,
    ),
    check(
      "connector_certifications_revoked_at_check",
      sql`${table.status} <> 'revoked' or ${table.revokedAt} is not null`,
    ),
    uniqueIndex("connector_certifications_identity_idx").on(
      table.provider,
      table.capability,
      table.adapterVersion,
      table.protocolVersion,
    ),
    index("connector_certifications_status_idx").on(table.status, table.provider, table.capability),
  ],
);

/**
 * Site-specific authority for one installed integration and one globally
 * certified capability. Global certification proves the adapter/protocol;
 * this row separately proves that the exact tenant site is safe to mutate.
 */
export const connectorActivations = pgTable(
  "connector_activations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => connectorCertifications.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("candidate"),
    evidence: jsonb("evidence")
      .$type<ConnectorActivationEvidence>()
      .notNull()
      .default({}),
    statusReason: text("status_reason"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "connector_activations_status_check",
      sql`${table.status} in ('candidate','active','suspended','revoked')`,
    ),
    check(
      "connector_activations_evidence_check",
      sql`jsonb_typeof(${table.evidence}) = 'object'`,
    ),
    check(
      "connector_activations_active_at_check",
      sql`${table.status} <> 'active' or ${table.activatedAt} is not null`,
    ),
    check(
      "connector_activations_suspended_at_check",
      sql`${table.status} <> 'suspended' or ${table.suspendedAt} is not null`,
    ),
    check(
      "connector_activations_revoked_at_check",
      sql`${table.status} <> 'revoked' or ${table.revokedAt} is not null`,
    ),
    uniqueIndex("connector_activations_identity_idx").on(
      table.integrationId,
      table.certificationId,
    ),
    index("connector_activations_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
    index("connector_activations_brand_status_idx").on(
      table.brandId,
      table.status,
      table.updatedAt,
    ),
    index("connector_activations_certification_status_idx").on(
      table.certificationId,
      table.status,
    ),
  ],
);

/**
 * Durable state machine for exactly one remote mutation. Proposal and before
 * fields are additionally protected by a database trigger in migration 0053.
 */
export const connectorMutations = pgTable(
  "connector_mutations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    approvalId: uuid("approval_id").references(() => agentApprovals.id, {
      onDelete: "set null",
    }),
    actionId: uuid("action_id").references(() => agentActionLedger.id, {
      onDelete: "set null",
    }),
    autonomyRolloutId: uuid("autonomy_rollout_id").references(
      () => agentAutonomyRollouts.id,
      { onDelete: "restrict" },
    ),
    autonomyDecisionId: uuid("autonomy_decision_id").references(
      () => agentAutonomyDecisions.id,
      { onDelete: "restrict" },
    ),
    autonomyRolloutRevision: integer("autonomy_rollout_revision"),
    provider: text("provider").notNull(),
    capability: text("capability").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    protocolVersion: text("protocol_version").notNull(),
    resourceRef: text("resource_ref").notNull(),
    remoteResourceId: text("remote_resource_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    proposalHash: text("proposal_hash").notNull(),
    beforeState: jsonb("before_state").$type<ConnectorMutationState>().notNull(),
    proposedState: jsonb("proposed_state").$type<ConnectorMutationState>().notNull(),
    intendedDiff: jsonb("intended_diff").$type<ConnectorMutationDiff>().notNull(),
    beforeFingerprint: text("before_fingerprint").notNull(),
    expectedAfterFingerprint: text("expected_after_fingerprint").notNull(),
    policyDecision: jsonb("policy_decision").$type<ConnectorPolicyDecision>().notNull(),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => connectorCertifications.id, { onDelete: "restrict" }),
    resourceCount: integer("resource_count").notNull().default(1),
    isCanary: boolean("is_canary").notNull().default(true),
    batchKey: text("batch_key"),
    status: text("status").notNull().default("prepared"),
    verificationStatus: text("verification_status").notNull().default("pending"),
    rollbackStatus: text("rollback_status").notNull().default("not_required"),
    result: jsonb("result").$type<ConnectorMutationResult>(),
    rollbackHandle: jsonb("rollback_handle").$type<ConnectorRollbackHandle>(),
    failure: jsonb("failure").$type<ConnectorMutationFailure>(),
    beforeRevision: text("before_revision"),
    appliedRevision: text("applied_revision"),
    verifiedRevision: text("verified_revision"),
    revertedRevision: text("reverted_revision"),
    attemptCount: integer("attempt_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rollbackStartedAt: timestamp("rollback_started_at", { withTimezone: true }),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "connector_mutations_status_check",
      sql`${table.status} in ('no_op','prepared','writing','applied','verified','verification_failed','rollback_pending','reverted','rollback_failed','manual_recovery_required','blocked','cancelled')`,
    ),
    check(
      "connector_mutations_verification_status_check",
      sql`${table.verificationStatus} in ('pending','verified','failed')`,
    ),
    check(
      "connector_mutations_rollback_status_check",
      sql`${table.rollbackStatus} in ('not_required','pending','reverted','failed','manual_recovery_required')`,
    ),
    check(
      "connector_mutations_resource_count_check",
      sql`${table.resourceCount} > 0`,
    ),
    check(
      "connector_mutations_canary_scope_check",
      sql`not ${table.isCanary} or ${table.resourceCount} = 1`,
    ),
    check(
      "connector_mutations_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "connector_mutations_state_shape_check",
      sql`jsonb_typeof(${table.beforeState}) = 'object' and jsonb_typeof(${table.proposedState}) = 'object' and jsonb_typeof(${table.intendedDiff}) in ('object','array') and jsonb_typeof(${table.policyDecision}) = 'object'`,
    ),
    check(
      "connector_mutations_identity_check",
      sql`length(${table.provider}) > 0 and length(${table.capability}) > 0 and length(${table.adapterVersion}) > 0 and length(${table.protocolVersion}) > 0 and length(${table.resourceRef}) > 0 and length(${table.idempotencyKey}) > 0 and length(${table.proposalHash}) > 0 and length(${table.beforeFingerprint}) > 0 and length(${table.expectedAfterFingerprint}) > 0`,
    ),
    uniqueIndex("connector_mutations_brand_idempotency_idx").on(
      table.brandId,
      table.idempotencyKey,
    ),
    index("connector_mutations_brand_status_idx").on(table.brandId, table.status, table.createdAt),
    index("connector_mutations_verification_idx").on(
      table.brandId,
      table.verificationStatus,
      table.updatedAt,
    ),
    index("connector_mutations_rollback_idx").on(
      table.brandId,
      table.rollbackStatus,
      table.updatedAt,
    ),
    index("connector_mutations_batch_idx").on(table.brandId, table.batchKey, table.createdAt),
    index("connector_mutations_task_idx").on(table.taskId),
    index("connector_mutations_approval_idx").on(table.approvalId),
    index("connector_mutations_action_idx").on(table.actionId),
    index("connector_mutations_autonomy_rollout_idx").on(
      table.autonomyRolloutId,
      table.createdAt,
    ),
    uniqueIndex("connector_mutations_autonomy_decision_idx")
      .on(table.autonomyDecisionId)
      .where(sql`${table.autonomyDecisionId} is not null`),
    check(
      "connector_mutations_autonomy_link_check",
      sql`(${table.autonomyRolloutId} is null and ${table.autonomyDecisionId} is null and ${table.autonomyRolloutRevision} is null) or (${table.autonomyRolloutId} is not null and ${table.autonomyDecisionId} is not null and ${table.autonomyRolloutRevision} is not null and ${table.autonomyRolloutRevision} > 0)`,
    ),
  ],
);

/** Append-only lifecycle evidence for a remote mutation. */
export const connectorMutationEvents = pgTable(
  "connector_mutation_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    mutationId: uuid("mutation_id")
      .notNull()
      .references(() => connectorMutations.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    status: text("status").notNull(),
    detail: jsonb("detail").$type<ConnectorMutationEventDetail>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "connector_mutation_events_detail_check",
      sql`jsonb_typeof(${table.detail}) = 'object'`,
    ),
    index("connector_mutation_events_mutation_created_idx").on(
      table.mutationId,
      table.createdAt,
    ),
    index("connector_mutation_events_brand_created_idx").on(table.brandId, table.createdAt),
  ],
);

/** Tenant-scoped automatic stop for one provider capability. */
export const connectorCircuitBreakers = pgTable(
  "connector_circuit_breakers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    capability: text("capability").notNull(),
    status: text("status").notNull().default("closed"),
    reason: text("reason"),
    source: text("source"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "connector_circuit_breakers_status_check",
      sql`${table.status} in ('closed','open')`,
    ),
    check(
      "connector_circuit_breakers_open_state_check",
      sql`${table.status} <> 'open' or (${table.openedAt} is not null and ${table.reason} is not null and length(${table.reason}) > 0 and ${table.source} is not null and length(${table.source}) > 0)`,
    ),
    uniqueIndex("connector_circuit_breakers_identity_idx").on(
      table.brandId,
      table.provider,
      table.capability,
    ),
    index("connector_circuit_breakers_workspace_status_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
  ],
);
