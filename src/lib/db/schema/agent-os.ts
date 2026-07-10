import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
    successCondition: text("success_condition"),
    horizon: text("horizon").notNull().default("ongoing"),
    priority: integer("priority").notNull().default(50),
    status: text("status").notNull().default("active"),
    origin: text("origin").notNull().default("system_created"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
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
    resourceRef: text("resource_ref").notNull(),
    beforeState: jsonb("before_state").$type<unknown>(),
    afterState: jsonb("after_state").$type<unknown>().notNull(),
    riskLevel: text("risk_level").notNull(),
    expectedBenefit: text("expected_benefit").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersedesId: uuid("supersedes_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_approvals_brand_status_idx").on(table.brandId, table.status, table.createdAt),
    index("agent_approvals_task_idx").on(table.taskId),
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
