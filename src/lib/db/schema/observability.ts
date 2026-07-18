import { sql } from "drizzle-orm";
import {
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
import { workspaces } from "./app";
import { brands } from "./brand";
import {
  agentActionLedger,
  agentApprovals,
  agentMissions,
  agentPlanVersions,
  agentStepExecutions,
  agentTasks,
} from "./agent-os";

/**
 * Redacted, queryable spans for Claudia behavior. Durable domain tables remain
 * authoritative; these rows are an operational projection and never contain
 * hidden model reasoning.
 */
export const agentTraceSpans = pgTable(
  "agent_trace_spans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    traceId: text("trace_id").notNull(),
    spanKey: text("span_key").notNull(),
    parentSpanId: uuid("parent_span_id"),
    spanType: text("span_type").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("running"),
    requestId: text("request_id"),
    runId: text("run_id"),
    missionId: uuid("mission_id").references(() => agentMissions.id, {
      onDelete: "set null",
    }),
    planVersionId: uuid("plan_version_id").references(() => agentPlanVersions.id, {
      onDelete: "set null",
    }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    workflowInstanceId: text("workflow_instance_id"),
    stepExecutionId: uuid("step_execution_id").references(() => agentStepExecutions.id, {
      onDelete: "set null",
    }),
    actionId: uuid("action_id").references(() => agentActionLedger.id, {
      onDelete: "set null",
    }),
    approvalId: uuid("approval_id").references(() => agentApprovals.id, {
      onDelete: "set null",
    }),
    model: text("model"),
    promptVersion: text("prompt_version"),
    toolSchemaVersion: text("tool_schema_version"),
    policyVersion: text("policy_version"),
    redactedInput: jsonb("redacted_input").$type<Record<string, unknown>>(),
    redactedOutput: jsonb("redacted_output").$type<Record<string, unknown>>(),
    decisionRecord: jsonb("decision_record").$type<Record<string, unknown>>(),
    retryCount: integer("retry_count").notNull().default(0),
    errorClass: text("error_class"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    creditsCharged: integer("credits_charged"),
    monetaryCostMicros: integer("monetary_cost_micros"),
    wallClockMs: integer("wall_clock_ms"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    retentionUntil: timestamp("retention_until", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_trace_spans_identity_idx").on(table.traceId, table.spanKey),
    index("agent_trace_spans_scope_trace_idx").on(
      table.workspaceId,
      table.brandId,
      table.traceId,
      table.startedAt,
    ),
    index("agent_trace_spans_step_idx").on(table.stepExecutionId),
    index("agent_trace_spans_action_idx").on(table.actionId),
    index("agent_trace_spans_retention_idx").on(table.retentionUntil),
    check(
      "agent_trace_spans_status_check",
      sql`${table.status} in ('running','completed','degraded','blocked','failed','signal')`,
    ),
    check("agent_trace_spans_retry_check", sql`${table.retryCount} >= 0`),
    check(
      "agent_trace_spans_cost_check",
      sql`(${table.promptTokens} is null or ${table.promptTokens} >= 0) and (${table.completionTokens} is null or ${table.completionTokens} >= 0) and (${table.totalTokens} is null or ${table.totalTokens} >= 0) and (${table.creditsCharged} is null or ${table.creditsCharged} >= 0) and (${table.monetaryCostMicros} is null or ${table.monetaryCostMicros} >= 0) and (${table.wallClockMs} is null or ${table.wallClockMs} >= 0)`,
    ),
  ],
);

/** Deduplicated SLO/security incident with ownership, runbook, and replay links. */
export const agentOperationalIncidents = pgTable(
  "agent_operational_incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    fingerprint: text("fingerprint").notNull(),
    sloKey: text("slo_key").notNull(),
    severity: text("severity").notNull(),
    status: text("status").notNull().default("open"),
    owner: text("owner").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    traceId: text("trace_id"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    runbookPath: text("runbook_path").notNull(),
    replayPath: text("replay_path"),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    firstObservedAt: timestamp("first_observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: text("acknowledged_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_operational_incidents_active_fingerprint_idx")
      .on(table.fingerprint)
      .where(sql`${table.status} in ('open','acknowledged')`),
    index("agent_operational_incidents_status_severity_idx").on(
      table.status,
      table.severity,
      table.lastObservedAt,
    ),
    index("agent_operational_incidents_scope_idx").on(
      table.workspaceId,
      table.brandId,
      table.status,
    ),
    check(
      "agent_operational_incidents_status_check",
      sql`${table.status} in ('open','acknowledged','resolved','accepted')`,
    ),
    check(
      "agent_operational_incidents_severity_check",
      sql`${table.severity} in ('info','warning','high','critical')`,
    ),
    check("agent_operational_incidents_occurrence_check", sql`${table.occurrenceCount} > 0`),
  ],
);

/** Independently versioned behavior bundle and its mandatory release evidence. */
export const agentBehaviorReleases = pgTable(
  "agent_behavior_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    releaseKey: text("release_key").notNull(),
    status: text("status").notNull().default("draft"),
    owner: text("owner").notNull(),
    componentVersions: jsonb("component_versions")
      .$type<Record<string, string>>()
      .notNull(),
    affectedEvalSuites: jsonb("affected_eval_suites").$type<string[]>().notNull(),
    beforeReport: jsonb("before_report").$type<Record<string, unknown>>().notNull(),
    afterReport: jsonb("after_report").$type<Record<string, unknown>>().notNull(),
    migrationPlan: text("migration_plan").notNull(),
    rollbackPlan: text("rollback_plan").notNull(),
    canaryCohort: jsonb("canary_cohort").$type<Record<string, unknown>>().notNull(),
    monitoringStartsAt: timestamp("monitoring_starts_at", { withTimezone: true }).notNull(),
    monitoringEndsAt: timestamp("monitoring_ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_behavior_releases_key_idx").on(table.releaseKey),
    index("agent_behavior_releases_status_idx").on(table.status, table.createdAt),
    check(
      "agent_behavior_releases_status_check",
      sql`${table.status} in ('draft','candidate','canary','released','rolled_back')`,
    ),
    check(
      "agent_behavior_releases_monitoring_window_check",
      sql`${table.monitoringEndsAt} > ${table.monitoringStartsAt}`,
    ),
    check(
      "agent_behavior_releases_suites_check",
      sql`jsonb_typeof(${table.affectedEvalSuites}) = 'array' and jsonb_array_length(${table.affectedEvalSuites}) > 0`,
    ),
  ],
);

/** One suite result tied to an immutable dataset, grader, release, and report. */
export const agentEvalRuns = pgTable(
  "agent_eval_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    releaseId: uuid("release_id").references(() => agentBehaviorReleases.id, {
      onDelete: "set null",
    }),
    suite: text("suite").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    graderVersion: text("grader_version").notNull(),
    status: text("status").notNull(),
    metrics: jsonb("metrics").$type<Record<string, number>>().notNull(),
    reportRef: text("report_ref").notNull(),
    codeCommit: text("code_commit").notNull(),
    humanReview: jsonb("human_review").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_eval_runs_release_suite_idx").on(table.releaseId, table.suite, table.createdAt),
    check("agent_eval_runs_status_check", sql`${table.status} in ('passed','failed','error')`),
    check(
      "agent_eval_runs_window_check",
      sql`${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);
