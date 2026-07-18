import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./app";
import { brands } from "./brand";

/** Durable objective that gives every autonomous task a business reason. */
export const agentMissions = pgTable(
  "agent_missions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    key: text("key").notNull().default("primary"),
    objective: text("objective").notNull(),
    metric: text("metric"),
    baseline: jsonb("baseline").$type<{
      value: number;
      observedAt: string;
      sourceRefs: string[];
    }>(),
    target: jsonb("target").$type<{ value: number }>(),
    successCondition: text("success_condition"),
    horizon: text("horizon").notNull().default("ongoing"),
    horizonStartAt: timestamp("horizon_start_at", { withTimezone: true }),
    horizonEndAt: timestamp("horizon_end_at", { withTimezone: true }),
    priority: integer("priority").notNull().default(50),
    budget: jsonb("budget").$type<{
      maxCredits: number;
      maxRemoteWrites: number;
      maxCostCents: number;
    }>(),
    constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
    allowedCapabilities: jsonb("allowed_capabilities")
      .$type<string[]>()
      .notNull()
      .default(["observe", "prepare"]),
    stopCondition: text("stop_condition"),
    definitionVersion: integer("definition_version").notNull().default(1),
    status: text("status").notNull().default("active"),
    origin: text("origin").notNull().default("system_created"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "agent_missions_metric_check",
      sql`${table.metric} is null or ${table.metric} in ('ai_answer_share_percent', 'qualified_non_brand_clicks', 'critical_crawler_findings', 'grounded_pages_published')`,
    ),
    check(
      "agent_missions_priority_check",
      sql`${table.priority} >= 0 and ${table.priority} <= 100`,
    ),
    check(
      "agent_missions_definition_version_check",
      sql`${table.definitionVersion} > 0`,
    ),
    check(
      "agent_missions_horizon_order_check",
      sql`${table.horizonStartAt} is null or ${table.horizonEndAt} is null or ${table.horizonEndAt} > ${table.horizonStartAt}`,
    ),
    check(
      "agent_missions_constraints_array_check",
      sql`jsonb_typeof(${table.constraints}) = 'array'`,
    ),
    check(
      "agent_missions_capabilities_check",
      sql`jsonb_typeof(${table.allowedCapabilities}) = 'array' and jsonb_array_length(${table.allowedCapabilities}) > 0 and ${table.allowedCapabilities} <@ '["observe","prepare","article.create","article.update","article.meta.update","article.schema.update","site.meta.update","site.schema.update","robots.update","llms_txt.update","rollback.supported"]'::jsonb`,
    ),
    check(
      "agent_missions_definition_completeness_check",
      sql`(${table.metric} is null and ${table.baseline} is null and ${table.target} is null and ${table.horizonStartAt} is null and ${table.horizonEndAt} is null and ${table.budget} is null and ${table.stopCondition} is null) or (${table.metric} is not null and ${table.baseline} is not null and jsonb_typeof(${table.baseline}) = 'object' and jsonb_typeof(${table.baseline}->'value') = 'number' and jsonb_typeof(${table.baseline}->'observedAt') = 'string' and jsonb_typeof(${table.baseline}->'sourceRefs') = 'array' and jsonb_array_length(${table.baseline}->'sourceRefs') > 0 and ${table.target} is not null and jsonb_typeof(${table.target}) = 'object' and jsonb_typeof(${table.target}->'value') = 'number' and ${table.horizonStartAt} is not null and ${table.horizonEndAt} is not null and ${table.budget} is not null and jsonb_typeof(${table.budget}) = 'object' and jsonb_typeof(${table.budget}->'maxCredits') = 'number' and jsonb_typeof(${table.budget}->'maxRemoteWrites') = 'number' and jsonb_typeof(${table.budget}->'maxCostCents') = 'number' and ${table.successCondition} is not null and ${table.stopCondition} is not null)`,
    ),
    uniqueIndex("agent_missions_brand_key_idx").on(table.brandId, table.key),
    index("agent_missions_brand_status_idx").on(table.brandId, table.status),
    index("agent_missions_brand_priority_idx").on(table.brandId, table.priority),
  ],
);

/** Immutable weekly plan revision. Replanning creates a new row and points back. */
export const agentPlanVersions = pgTable(
  "agent_plan_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => agentMissions.id, { onDelete: "cascade" }),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    rationale: text("rationale").notNull(),
    evidenceSnapshot: jsonb("evidence_snapshot").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull(),
    supersedesId: uuid("supersedes_id"),
    replanReason: text("replan_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_plan_versions_mission_version_idx").on(table.missionId, table.version),
    index("agent_plan_versions_brand_window_idx").on(table.brandId, table.windowStart),
  ],
);

/** Ordered work unit. Existing jobs and workflows remain the executors. */
export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id")
      .notNull()
      .references(() => agentMissions.id, { onDelete: "cascade" }),
    planVersionId: uuid("plan_version_id").references(() => agentPlanVersions.id, {
      onDelete: "set null",
    }),
    parentTaskId: uuid("parent_task_id"),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    taskType: text("task_type").notNull(),
    executor: text("executor").notNull(),
    dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
    expectedImpact: text("expected_impact"),
    confidence: integer("confidence").notNull().default(50),
    riskLevel: text("risk_level").notNull().default("low"),
    requiredAuthority: text("required_authority").notNull().default("observe"),
    status: text("status").notNull().default("planned"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attempt: integer("attempt").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    originalExecutorId: text("original_executor_id"),
    takeoverExecutorId: text("takeover_executor_id"),
    lastErrorCode: text("last_error_code"),
    lastErrorClass: text("last_error_class"),
    retryAfter: timestamp("retry_after", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>(),
    artifactRef: text("artifact_ref"),
    outcomeRef: text("outcome_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_tasks_brand_idempotency_idx").on(table.brandId, table.idempotencyKey),
    index("agent_tasks_brand_status_schedule_idx").on(
      table.brandId,
      table.status,
      table.scheduledFor,
    ),
    index("agent_tasks_plan_idx").on(table.planVersionId),
  ],
);

/**
 * Stable identity and compare-and-swap lease for one retryable unit of work.
 * The row, including billingWorkId/actionId, is created before the long-running
 * operation starts and is reused by every retry or takeover.
 */
export const agentStepExecutions = pgTable(
  "agent_step_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => agentMissions.id, { onDelete: "set null" }),
    planVersionId: uuid("plan_version_id").references(() => agentPlanVersions.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    workflowInstanceId: text("workflow_instance_id").notNull(),
    stepKey: text("step_key").notNull(),
    workKey: text("work_key").notNull().default("default"),
    actionId: uuid("action_id").defaultRandom().notNull(),
    billingWorkId: uuid("billing_work_id").defaultRandom().notNull(),
    status: text("status").notNull().default("pending"),
    outcome: text("outcome"),
    input: jsonb("input").$type<Record<string, unknown>>(),
    output: jsonb("output").$type<Record<string, unknown>>(),
    outputRef: text("output_ref"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    originalExecutorId: text("original_executor_id"),
    takeoverExecutorId: text("takeover_executor_id"),
    lastErrorCode: text("last_error_code"),
    lastErrorClass: text("last_error_class"),
    lastError: text("last_error"),
    retryAfter: timestamp("retry_after", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_step_executions_work_idx").on(
      table.workflowInstanceId,
      table.stepKey,
      table.workKey,
    ),
    index("agent_step_executions_lease_idx").on(table.status, table.leaseExpiresAt),
    index("agent_step_executions_task_idx").on(table.taskId),
    uniqueIndex("agent_step_executions_billing_work_idx").on(table.billingWorkId),
    uniqueIndex("agent_step_executions_action_idx").on(table.actionId),
  ],
);

/** Expected scheduled fan-out, independent of a successful Workflow create. */
export const agentScheduledWork = pgTable(
  "agent_scheduled_work",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    scheduleKind: text("schedule_kind").notNull(),
    scheduleKey: text("schedule_key").notNull(),
    workflowInstanceId: text("workflow_instance_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("expected"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: text("last_error"),
    retryAfter: timestamp("retry_after", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    operatorReplayRequested: boolean("operator_replay_requested").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("agent_scheduled_work_identity_idx").on(
      table.scheduleKind,
      table.brandId,
      table.scheduleKey,
    ),
    uniqueIndex("agent_scheduled_work_workflow_idx").on(table.workflowInstanceId),
    index("agent_scheduled_work_reconcile_idx").on(table.status, table.retryAfter),
  ],
);

/** Bounded operational metadata for every hardened model call. */
export const agentLlmCalls = pgTable(
  "agent_llm_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    stepExecutionId: uuid("step_execution_id").references(() => agentStepExecutions.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    tier: text("tier").notNull(),
    promptVersion: text("prompt_version").notNull().default("legacy"),
    status: text("status").notNull(),
    errorClass: text("error_class"),
    latencyMs: integer("latency_ms").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    terminationReason: text("termination_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_llm_calls_brand_created_idx").on(table.brandId, table.createdAt),
    index("agent_llm_calls_step_idx").on(table.stepExecutionId),
  ],
);

/** Append-only source of truth for presence, progress, reports, and auditability. */
export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    missionId: uuid("mission_id").references(() => agentMissions.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    actor: text("actor").notNull().default("claudia"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_events_brand_created_idx").on(table.brandId, table.createdAt),
    index("agent_events_task_created_idx").on(table.taskId, table.createdAt),
  ],
);

/** Brand facts, owner instructions, prohibitions, and temporary operating constraints. */
export const agentMemory = pgTable(
  "agent_memory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    confidence: integer("confidence").notNull().default(100),
    provenance: text("provenance").notNull(),
    scope: text("scope").notNull().default("brand"),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_memory_brand_kind_key_scope_idx").on(
      table.brandId,
      table.kind,
      table.key,
      table.scope,
    ),
    index("agent_memory_brand_status_expiry_idx").on(table.brandId, table.status, table.expiresAt),
  ],
);

/**
 * Provenance-rich memory data plane. Content is append-only; lifecycle columns
 * may change with compare-and-swap when a correction supersedes a record.
 * Canonical owner policy remains in agent_owner_policies and is never copied here.
 */
export const agentMemoryRecords = pgTable(
  "agent_memory_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    memoryClass: text("memory_class").notNull(),
    subjectKey: text("subject_key").notNull(),
    statement: text("statement").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    impactLevel: text("impact_level").notNull().default("low"),
    sourceType: text("source_type").notNull(),
    sourceRef: text("source_ref").notNull(),
    creator: text("creator").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    confidence: integer("confidence").notNull().default(50),
    verificationState: text("verification_state").notNull().default("unverified"),
    sensitivity: text("sensitivity").notNull().default("internal"),
    allowedConsumers: jsonb("allowed_consumers")
      .$type<string[]>()
      .notNull()
      .default(["planner", "research", "draft", "audit", "ask", "reflection", "learning"]),
    trustLevel: text("trust_level").notNull().default("untrusted"),
    status: text("status").notNull().default("active"),
    supersedesId: uuid("supersedes_id"),
    supersededById: uuid("superseded_by_id"),
    contradictionGroup: text("contradiction_group"),
    extractionVersion: text("extraction_version").notNull(),
    modelVersion: text("model_version"),
    lifecycleVersion: integer("lifecycle_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "agent_memory_records_class_check",
      sql`${table.memoryClass} in ('authoritative_fact','preference','correction','episodic_observation','semantic_summary','procedural_learning')`,
    ),
    check(
      "agent_memory_records_creator_check",
      sql`${table.creator} in ('owner','verified_tool','model_inference','system')`,
    ),
    check(
      "agent_memory_records_source_type_check",
      sql`${table.sourceType} in ('owner_input','first_party','verified_tool','model_inference','system','task_output','external_content')`,
    ),
    check(
      "agent_memory_records_source_creator_check",
      sql`(${table.sourceType} <> 'owner_input' or ${table.creator} = 'owner') and (${table.sourceType} <> 'model_inference' or ${table.creator} = 'model_inference') and (${table.sourceType} <> 'external_content' or ${table.creator} <> 'owner')`,
    ),
    check(
      "agent_memory_records_authority_check",
      sql`${table.memoryClass} <> 'authoritative_fact' or (${table.creator} in ('owner','verified_tool','system') and ${table.verificationState} in ('verified','owner_approved') and ${table.trustLevel} = 'trusted')`,
    ),
    check(
      "agent_memory_records_correction_check",
      sql`${table.memoryClass} <> 'correction' or (${table.creator} = 'owner' and ${table.verificationState} = 'owner_approved' and ${table.trustLevel} = 'trusted' and ${table.supersedesId} is not null)`,
    ),
    check(
      "agent_memory_records_model_trust_check",
      sql`${table.creator} <> 'model_inference' or ${table.trustLevel} = 'untrusted'`,
    ),
    check(
      "agent_memory_records_external_trust_check",
      sql`${table.sourceType} <> 'external_content' or ${table.trustLevel} = 'untrusted'`,
    ),
    check(
      "agent_memory_records_confidence_check",
      sql`${table.confidence} >= 0 and ${table.confidence} <= 100`,
    ),
    check(
      "agent_memory_records_impact_check",
      sql`${table.impactLevel} in ('low','medium','high')`,
    ),
    check(
      "agent_memory_records_verification_check",
      sql`${table.verificationState} in ('unverified','verified','owner_approved','rejected')`,
    ),
    check(
      "agent_memory_records_sensitivity_check",
      sql`${table.sensitivity} in ('public','internal','confidential','restricted')`,
    ),
    check(
      "agent_memory_records_trust_check",
      sql`${table.trustLevel} in ('trusted','untrusted')`,
    ),
    check(
      "agent_memory_records_status_check",
      sql`${table.status} in ('active','superseded','invalidated','rejected')`,
    ),
    check(
      "agent_memory_records_consumers_check",
      sql`jsonb_typeof(${table.allowedConsumers}) = 'array' and jsonb_array_length(${table.allowedConsumers}) > 0`,
    ),
    check(
      "agent_memory_records_validity_check",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.validFrom}`,
    ),
    check(
      "agent_memory_records_lifecycle_version_check",
      sql`${table.lifecycleVersion} > 0`,
    ),
    index("agent_memory_records_retrieval_idx").on(
      table.workspaceId,
      table.brandId,
      table.status,
      table.validFrom,
      table.expiresAt,
    ),
    index("agent_memory_records_subject_idx").on(table.brandId, table.subjectKey),
    index("agent_memory_records_contradiction_idx").on(
      table.brandId,
      table.contradictionGroup,
      table.status,
    ),
    uniqueIndex("agent_memory_records_reflection_source_idx")
      .on(table.brandId, table.sourceRef)
      .where(sql`${table.sourceRef} like 'reflection:%'`),
  ],
);

/** Immutable record-to-record provenance and derivation edges. */
export const agentMemoryDependencies = pgTable(
  "agent_memory_dependencies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    recordId: uuid("record_id")
      .notNull()
      .references(() => agentMemoryRecords.id, { onDelete: "cascade" }),
    dependsOnRecordId: uuid("depends_on_record_id")
      .notNull()
      .references(() => agentMemoryRecords.id, { onDelete: "cascade" }),
    relation: text("relation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "agent_memory_dependencies_relation_check",
      sql`${table.relation} in ('supports','derived_from','corrects','contradicts','outcome_of')`,
    ),
    check(
      "agent_memory_dependencies_distinct_check",
      sql`${table.recordId} <> ${table.dependsOnRecordId}`,
    ),
    uniqueIndex("agent_memory_dependencies_edge_idx").on(
      table.recordId,
      table.dependsOnRecordId,
      table.relation,
    ),
    index("agent_memory_dependencies_reverse_idx").on(table.dependsOnRecordId, table.relation),
  ],
);

/** Durable outbox marker ensuring a correction reaches summaries and future plans. */
export const agentMemoryPropagationMarkers = pgTable(
  "agent_memory_propagation_markers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    correctionId: uuid("correction_id")
      .notNull()
      .references(() => agentMemoryRecords.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    retryAfter: timestamp("retry_after", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "agent_memory_propagation_status_check",
      sql`${table.status} in ('pending','in_progress','applied','dead_letter')`,
    ),
    check(
      "agent_memory_propagation_attempt_check",
      sql`${table.attemptCount} >= 0`,
    ),
    uniqueIndex("agent_memory_propagation_correction_idx").on(table.correctionId),
    index("agent_memory_propagation_drain_idx").on(
      table.status,
      table.retryAfter,
      table.leaseExpiresAt,
    ),
  ],
);

/** Append-only owner authority policy history. Active rows are never overwritten. */
export const agentOwnerPolicies = pgTable(
  "agent_owner_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    policyKey: text("policy_key").notNull(),
    effect: text("effect").notNull(),
    capabilities: jsonb("capabilities").$type<string[]>().notNull(),
    resources: jsonb("resources").$type<Record<string, unknown>>().notNull(),
    conditions: jsonb("conditions").$type<Array<Record<string, unknown>>>().notNull(),
    originalText: text("original_text").notNull(),
    source: text("source").notNull().default("owner"),
    parserVersion: text("parser_version").notNull(),
    policyVersion: text("policy_version").notNull(),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    supersedesId: uuid("supersedes_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_owner_policies_active_key_idx")
      .on(table.brandId, table.policyKey)
      .where(sql`${table.status} = 'active'`),
    index("agent_owner_policies_brand_status_expiry_idx").on(
      table.brandId,
      table.status,
      table.expiresAt,
    ),
  ],
);

/** Owner decision on an exact proposed resource change. */
export const agentApprovals = pgTable(
  "agent_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    capability: text("capability"),
    resourceRef: text("resource_ref").notNull(),
    destination: text("destination"),
    beforeState: jsonb("before_state").$type<unknown>(),
    afterState: jsonb("after_state").$type<unknown>().notNull(),
    proposalHash: text("proposal_hash").notNull().default(""),
    policyVersion: text("policy_version").notNull().default("legacy"),
    modelPromptVersion: text("model_prompt_version"),
    riskLevel: text("risk_level").notNull(),
    expectedBenefit: text("expected_benefit").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidationReason: text("invalidation_reason"),
    supersedesId: uuid("supersedes_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_approvals_pending_proposal_hash_idx")
      .on(table.brandId, table.proposalHash)
      .where(
        sql`${table.status} = 'pending' and ${table.invalidatedAt} is null and ${table.proposalHash} <> ''`,
      ),
    index("agent_approvals_brand_status_idx").on(table.brandId, table.status, table.createdAt),
    index("agent_approvals_task_idx").on(table.taskId),
  ],
);

/** One-time receipt for a signed public workflow callback. */
export const agentCallbackReceipts = pgTable(
  "agent_callback_receipts",
  {
    nonce: text("nonce").primaryKey(),
    workflowInstanceId: text("workflow_instance_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    stepName: text("step_name").notNull(),
    tokenSubject: text("token_subject").notNull(),
    requestId: text("request_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_callback_receipts_expiry_idx").on(table.expiresAt),
    index("agent_callback_receipts_workflow_idx").on(table.workflowInstanceId, table.stepName),
  ],
);

/** Complete record of a material remote change and its verification/rollback state. */
export const agentActionLedger = pgTable(
  "agent_action_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    approvalId: uuid("approval_id").references(() => agentApprovals.id, { onDelete: "set null" }),
    actionType: text("action_type").notNull(),
    resourceRef: text("resource_ref").notNull(),
    capability: text("capability").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    beforeState: jsonb("before_state").$type<unknown>(),
    appliedChange: jsonb("applied_change").$type<unknown>().notNull(),
    remoteRef: text("remote_ref"),
    rollbackHandle: jsonb("rollback_handle").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("applied"),
    verificationStatus: text("verification_status").notNull().default("pending"),
    verificationResult: jsonb("verification_result").$type<Record<string, unknown>>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_action_ledger_brand_idempotency_idx").on(
      table.brandId,
      table.idempotencyKey,
    ),
    index("agent_action_ledger_brand_created_idx").on(table.brandId, table.createdAt),
    index("agent_action_ledger_task_idx").on(table.taskId),
  ],
);

/** Verified action-to-content/query/objective outcome lineage. */
export const agentOutcomeAttributions = pgTable(
  "agent_outcome_attributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    attributionKey: text("attribution_key").notNull(),
    actionId: uuid("action_id")
      .notNull()
      .references(() => agentActionLedger.id, { onDelete: "cascade" }),
    contentId: uuid("content_id"),
    queryKey: text("query_key"),
    objectiveId: uuid("objective_id").references(() => agentMissions.id, {
      onDelete: "set null",
    }),
    outcomeKind: text("outcome_kind").notNull(),
    outcomeValue: real("outcome_value").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    baseline: jsonb("baseline").$type<{ value: number; observedAt: string }>(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    confounders: jsonb("confounders")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    holdoutGroup: text("holdout_group"),
    verified: boolean("verified").notNull().default(false),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    sourceRef: text("source_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "agent_outcome_attributions_window_check",
      sql`${table.windowEnd} > ${table.windowStart} and ${table.observedAt} >= ${table.windowStart} and ${table.observedAt} <= ${table.windowEnd}`,
    ),
    check(
      "agent_outcome_attributions_evidence_check",
      sql`jsonb_typeof(${table.evidenceRefs}) = 'array'`,
    ),
    check(
      "agent_outcome_attributions_verified_evidence_check",
      sql`not ${table.verified} or jsonb_array_length(${table.evidenceRefs}) > 0`,
    ),
    uniqueIndex("agent_outcome_attributions_key_idx").on(table.brandId, table.attributionKey),
    index("agent_outcome_attributions_action_idx").on(table.actionId, table.observedAt),
    index("agent_outcome_attributions_learning_idx").on(
      table.brandId,
      table.outcomeKind,
      table.verified,
      table.observedAt,
    ),
  ],
);

/** Bounded, versioned learned strategy weights with a rollback pointer. */
export const agentStrategyWeightVersions = pgTable(
  "agent_strategy_weight_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    actionFamily: text("action_family").notNull(),
    strategyKey: text("strategy_key").notNull(),
    version: integer("version").notNull(),
    weight: real("weight").notNull().default(1),
    priorVersionId: uuid("prior_version_id"),
    sampleSize: integer("sample_size").notNull().default(0),
    confidence: integer("confidence").notNull().default(0),
    status: text("status").notNull().default("candidate"),
    evidenceSnapshot: jsonb("evidence_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "agent_strategy_weight_versions_weight_check",
      sql`${table.weight} >= 0.5 and ${table.weight} <= 2`,
    ),
    check(
      "agent_strategy_weight_versions_version_check",
      sql`${table.version} > 0`,
    ),
    check(
      "agent_strategy_weight_versions_sample_check",
      sql`${table.sampleSize} >= 0`,
    ),
    check(
      "agent_strategy_weight_versions_confidence_check",
      sql`${table.confidence} >= 0 and ${table.confidence} <= 100`,
    ),
    check(
      "agent_strategy_weight_versions_status_check",
      sql`${table.status} in ('candidate','active','rolled_back')`,
    ),
    check(
      "agent_strategy_weight_versions_active_threshold_check",
      sql`${table.status} <> 'active' or (${table.sampleSize} >= 20 and ${table.confidence} >= 80) or (${table.version} = 1 and ${table.weight} = 1 and ${table.sampleSize} = 0 and ${table.confidence} = 0 and ${table.priorVersionId} is null and ${table.evidenceSnapshot}->>'kind' = 'neutral_baseline')`,
    ),
    uniqueIndex("agent_strategy_weight_versions_version_idx").on(
      table.brandId,
      table.actionFamily,
      table.strategyKey,
      table.version,
    ),
    uniqueIndex("agent_strategy_weight_versions_active_idx")
      .on(table.brandId, table.actionFamily, table.strategyKey)
      .where(sql`${table.status} = 'active'`),
    index("agent_strategy_weight_versions_brand_status_idx").on(table.brandId, table.status),
  ],
);
