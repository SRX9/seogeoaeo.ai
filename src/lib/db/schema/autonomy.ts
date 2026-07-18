import { sql } from "drizzle-orm";
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
import { workspaces } from "./app";
import { brands } from "./brand";
import { agentTasks } from "./agent-os";
import { agentBehaviorReleases } from "./observability";

export type AutonomyRiskBudget = {
  maxActionsPerUtcDay: number;
  maxCreditsPerUtcDay: number;
  maxMoneyMicrosPerUtcDay: number;
  maxResourcesPerAction: number;
  destinations: string[];
  allowedUtcHours: number[];
};

export type AutonomyStopConditions = {
  pauseOnAnyCriticalIncident: boolean;
  sloKeys: string[];
  maxVerificationFailureRate: number;
  maxRollbackFailureRate: number;
  maxBusinessHarmPercent: number;
};

/**
 * Platform-selected authority for one brand and capability. The legacy brand
 * autonomy mode remains owner intent; it cannot create one of these rows or
 * increase this independently reviewed ceiling.
 */
export const agentAutonomyRollouts = pgTable(
  "agent_autonomy_rollouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    capability: text("capability").notNull(),
    provider: text("provider"),
    certificationId: uuid("certification_id"),
    releaseId: uuid("release_id").references(() => agentBehaviorReleases.id, {
      onDelete: "restrict",
    }),
    cohortKey: text("cohort_key").notNull(),
    cohortPercent: integer("cohort_percent").notNull().default(0),
    autonomyLevel: integer("autonomy_level").notNull().default(0),
    rolloutStage: integer("rollout_stage").notNull().default(1),
    executionMode: text("execution_mode").notNull().default("eval"),
    status: text("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(1),
    strategyRef: text("strategy_ref"),
    riskBudget: jsonb("risk_budget").$type<AutonomyRiskBudget>().notNull(),
    stopConditions: jsonb("stop_conditions")
      .$type<AutonomyStopConditions>()
      .notNull(),
    minimumSampleSize: integer("minimum_sample_size").notNull().default(30),
    observationWindowStartsAt: timestamp("observation_window_starts_at", {
      withTimezone: true,
    }).notNull(),
    observationWindowEndsAt: timestamp("observation_window_ends_at", {
      withTimezone: true,
    }).notNull(),
    owner: text("owner").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pauseReason: text("pause_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_autonomy_rollouts_active_capability_idx")
      .on(table.brandId, table.capability)
      .where(sql`${table.status} in ('active','paused')`),
    index("agent_autonomy_rollouts_scope_status_idx").on(
      table.workspaceId,
      table.brandId,
      table.status,
      table.updatedAt,
    ),
    index("agent_autonomy_rollouts_release_idx").on(table.releaseId, table.status),
    check(
      "agent_autonomy_rollouts_status_check",
      sql`${table.status} in ('draft','active','paused','completed','rolled_back')`,
    ),
    check(
      "agent_autonomy_rollouts_mode_check",
      sql`${table.executionMode} in ('eval','synthetic','internal','shadow','live')`,
    ),
    check(
      "agent_autonomy_rollouts_level_stage_check",
      sql`${table.autonomyLevel} between 0 and 4 and ${table.rolloutStage} between 1 and 8`,
    ),
    check(
      "agent_autonomy_rollouts_cohort_check",
      sql`${table.cohortPercent} between 0 and 100`,
    ),
    check("agent_autonomy_rollouts_revision_check", sql`${table.revision} > 0`),
    check(
      "agent_autonomy_rollouts_window_check",
      sql`${table.observationWindowEndsAt} > ${table.observationWindowStartsAt}`,
    ),
    check(
      "agent_autonomy_rollouts_sample_check",
      sql`${table.minimumSampleSize} > 0`,
    ),
    check(
      "agent_autonomy_rollouts_json_check",
      sql`jsonb_typeof(${table.riskBudget}) = 'object' and jsonb_typeof(${table.stopConditions}) = 'object'`,
    ),
    check(
      "agent_autonomy_rollouts_shadow_stage_check",
      sql`${table.rolloutStage} <> 4 or ${table.executionMode} = 'shadow'`,
    ),
    check(
      "agent_autonomy_rollouts_level4_evidence_check",
      sql`${table.autonomyLevel} <> 4 or (${table.certificationId} is not null and ${table.releaseId} is not null and length(coalesce(${table.strategyRef}, '')) > 0)`,
    ),
  ],
);

/** Immutable executor-bound decision, including counterfactual shadow output. */
export const agentAutonomyDecisions = pgTable(
  "agent_autonomy_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rolloutId: uuid("rollout_id").references(() => agentAutonomyRollouts.id, {
      onDelete: "restrict",
    }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => agentTasks.id, { onDelete: "set null" }),
    decisionKey: text("decision_key").notNull(),
    proposalHash: text("proposal_hash").notNull(),
    capability: text("capability").notNull(),
    resourceRef: text("resource_ref").notNull(),
    destination: text("destination"),
    autonomyLevel: integer("autonomy_level").notNull(),
    rolloutStage: integer("rollout_stage").notNull(),
    executionMode: text("execution_mode").notNull(),
    cohortBucket: integer("cohort_bucket"),
    cohortEligible: boolean("cohort_eligible").notNull().default(false),
    approvalValidated: boolean("approval_validated").notNull().default(false),
    certificationValidated: boolean("certification_validated").notNull().default(false),
    decision: text("decision").notNull(),
    reason: text("reason").notNull(),
    baselineDecision: jsonb("baseline_decision")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    policySnapshot: jsonb("policy_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_autonomy_decisions_scope_key_idx").on(
      table.brandId,
      table.decisionKey,
    ),
    index("agent_autonomy_decisions_rollout_created_idx").on(
      table.rolloutId,
      table.createdAt,
    ),
    index("agent_autonomy_decisions_scope_capability_idx").on(
      table.workspaceId,
      table.brandId,
      table.capability,
      table.createdAt,
    ),
    check(
      "agent_autonomy_decisions_decision_check",
      sql`${table.decision} in ('allow','shadow','approval_required','deny','pause')`,
    ),
    check(
      "agent_autonomy_decisions_level_stage_check",
      sql`${table.autonomyLevel} between 0 and 4 and ${table.rolloutStage} between 0 and 8`,
    ),
    check(
      "agent_autonomy_decisions_bucket_check",
      sql`${table.cohortBucket} is null or ${table.cohortBucket} between 0 and 9999`,
    ),
  ],
);

/** Append-only evidence for selection, expansion, pause, and rollback. */
export const agentAutonomyRolloutEvents = pgTable(
  "agent_autonomy_rollout_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rolloutId: uuid("rollout_id")
      .notNull()
      .references(() => agentAutonomyRollouts.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    fromStage: integer("from_stage"),
    toStage: integer("to_stage").notNull(),
    fromLevel: integer("from_level"),
    toLevel: integer("to_level").notNull(),
    fromCohortPercent: integer("from_cohort_percent"),
    toCohortPercent: integer("to_cohort_percent").notNull(),
    reason: text("reason").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull(),
    owner: text("owner").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_autonomy_rollout_events_rollout_created_idx").on(
      table.rolloutId,
      table.createdAt,
    ),
    check(
      "agent_autonomy_rollout_events_type_check",
      sql`${table.eventType} in ('selected','activated','expanded','paused','resumed','completed','rolled_back')`,
    ),
    check(
      "agent_autonomy_rollout_events_bounds_check",
      sql`${table.toStage} between 1 and 8 and ${table.toLevel} between 0 and 4 and ${table.toCohortPercent} between 0 and 100`,
    ),
    check(
      "agent_autonomy_rollout_events_evidence_check",
      sql`jsonb_typeof(${table.evidenceRefs}) = 'array' and jsonb_array_length(${table.evidenceRefs}) > 0`,
    ),
  ],
);

/** Versioned treatment-versus-control evidence for a single rollout window. */
export const agentCanaryMeasurements = pgTable(
  "agent_canary_measurements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rolloutId: uuid("rollout_id")
      .notNull()
      .references(() => agentAutonomyRollouts.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    metricClass: text("metric_class").notNull(),
    design: text("design").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    graderVersion: text("grader_version").notNull(),
    windowStartsAt: timestamp("window_starts_at", { withTimezone: true }).notNull(),
    windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
    treatmentN: integer("treatment_n").notNull(),
    controlN: integer("control_n").notNull(),
    treatmentMean: real("treatment_mean").notNull(),
    controlMean: real("control_mean").notNull(),
    effect: real("effect").notNull(),
    confidenceLevel: real("confidence_level").notNull(),
    intervalLow: real("interval_low").notNull(),
    intervalHigh: real("interval_high").notNull(),
    pValue: real("p_value"),
    conclusion: text("conclusion").notNull(),
    causalClaim: boolean("causal_claim").notNull().default(false),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("agent_canary_measurements_window_metric_idx").on(
      table.rolloutId,
      table.metric,
      table.windowStartsAt,
      table.windowEndsAt,
    ),
    index("agent_canary_measurements_rollout_conclusion_idx").on(
      table.rolloutId,
      table.conclusion,
      table.recordedAt,
    ),
    check(
      "agent_canary_measurements_class_check",
      sql`${table.metricClass} in ('agent_correctness','business_effect')`,
    ),
    check(
      "agent_canary_measurements_design_check",
      sql`${table.design} in ('holdout','staggered_rollout','matched_cohort','time_series_control')`,
    ),
    check(
      "agent_canary_measurements_window_check",
      sql`${table.windowEndsAt} > ${table.windowStartsAt}`,
    ),
    check(
      "agent_canary_measurements_sample_check",
      sql`${table.treatmentN} >= 0 and ${table.controlN} >= 0`,
    ),
    check(
      "agent_canary_measurements_confidence_check",
      sql`${table.confidenceLevel} > 0 and ${table.confidenceLevel} < 1 and ${table.intervalHigh} >= ${table.intervalLow} and (${table.pValue} is null or (${table.pValue} >= 0 and ${table.pValue} <= 1))`,
    ),
    check(
      "agent_canary_measurements_conclusion_check",
      sql`${table.conclusion} in ('insufficient_data','non_inferior','improved','regressed','harm_detected')`,
    ),
    check(
      "agent_canary_measurements_evidence_check",
      sql`jsonb_typeof(${table.evidenceRefs}) = 'array' and jsonb_array_length(${table.evidenceRefs}) > 0`,
    ),
  ],
);

/** Production-like evidence that emergency response and recovery were exercised. */
export const agentAutonomyExercises = pgTable(
  "agent_autonomy_exercises",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rolloutId: uuid("rollout_id")
      .notNull()
      .references(() => agentAutonomyRollouts.id, { onDelete: "restrict" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    environment: text("environment").notNull(),
    status: text("status").notNull(),
    scenario: text("scenario").notNull(),
    evidenceRef: text("evidence_ref").notNull(),
    traceId: text("trace_id"),
    actionId: uuid("action_id"),
    owner: text("owner").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_autonomy_exercises_rollout_kind_idx").on(
      table.rolloutId,
      table.kind,
      table.completedAt,
    ),
    check(
      "agent_autonomy_exercises_kind_check",
      sql`${table.kind} in ('emergency_stop','incident_reconstruction','replay','rollback')`,
    ),
    check(
      "agent_autonomy_exercises_environment_check",
      sql`${table.environment} in ('local','staging','production_like','production')`,
    ),
    check(
      "agent_autonomy_exercises_status_check",
      sql`${table.status} in ('passed','failed','partial')`,
    ),
    check(
      "agent_autonomy_exercises_window_check",
      sql`${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);
