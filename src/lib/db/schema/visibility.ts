import {
  boolean,
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
import { user } from "./auth";
import { brands } from "./brand";

/**
 * Visibility-suite audit tables (Phase V0.3). Every run is persisted so later
 * phases can show deltas (V6.3) and prove traffic gains. Shapes follow
 * docs/visibility-suite/00-principles.md → "Shared data model".
 */

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    siteUrl: text("site_url").notNull(),
    businessType: text("business_type"),
    /** running | complete | failed */
    status: text("status").notNull().default("running"),
    overallScore: real("overall_score"),
    /** GEO-dashboard rollup (V2.3): citability·35 + brand·30 + crawler·25 + llmstxt·10. */
    aiVisibilityScore: real("ai_visibility_score"),
    citabilityScore: real("citability_score"),
    brandScore: real("brand_score"),
    eeatScore: real("eeat_score"),
    technicalScore: real("technical_score"),
    schemaScore: real("schema_score"),
    platformScore: real("platform_score"),
    /** Discovery payloads (robots/sitemap/llms) for tools that re-read a run. */
    discovery: jsonb("discovery"),
    error: text("error"),
    runVersion: integer("run_version").notNull().default(1),
    /** Deterministic scoring methodology version (see visibility/version.ts). */
    scorerVersion: integer("scorer_version").notNull().default(2),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("audits_workspace_id_idx").on(table.workspaceId)],
);

export const auditPages = pgTable(
  "audit_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    htmlHash: text("html_hash"),
    statusCode: integer("status_code"),
    meta: jsonb("meta"),
    headings: jsonb("headings"),
    wordCount: integer("word_count").notNull().default(0),
    hasSsrContent: boolean("has_ssr_content").notNull().default(true),
    /** Full PageSnapshot (minus raw html) for downstream analyzers. */
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_pages_audit_id_idx").on(table.auditId)],
);

export const auditFindings = pgTable(
  "audit_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Denormalized so the fix queue (V8.2) queries findings from audits AND tool runs uniformly. */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    /** Null for standalone Toolbox-run findings (V8.3). */
    auditId: uuid("audit_id").references(() => audits.id, { onDelete: "cascade" }),
    /** Set when the finding came from a standalone Toolbox run (V8.3). */
    toolRunId: uuid("tool_run_id"),
    /** seo | aeo | geo */
    pillar: text("pillar").notNull(),
    category: text("category").notNull(),
    /** critical | high | medium | low */
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    recommendation: text("recommendation").notNull(),
    /** auto | artifact | guided — drives the fix-queue action button (V8.2). */
    fixCapability: text("fix_capability"),
    /** Machine-applicable payload for V7.2 auto-apply. */
    fixPayload: jsonb("fix_payload"),
    isResolved: boolean("is_resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_findings_audit_id_idx").on(table.auditId)],
);

export const citabilityBlocks = pgTable(
  "citability_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditPageId: uuid("audit_page_id")
      .notNull()
      .references(() => auditPages.id, { onDelete: "cascade" }),
    heading: text("heading"),
    wordCount: integer("word_count").notNull().default(0),
    totalScore: real("total_score"),
    grade: text("grade"),
    /** The 5 citability dimensions. */
    breakdown: jsonb("breakdown"),
  },
  (table) => [index("citability_blocks_page_id_idx").on(table.auditPageId)],
);

export const schemaBlocks = pgTable(
  "schema_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditPageId: uuid("audit_page_id")
      .notNull()
      .references(() => auditPages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    format: text("format").notNull().default("json-ld"),
    valid: boolean("valid").notNull().default(false),
    richResultEligible: boolean("rich_result_eligible").notNull().default(false),
    issues: jsonb("issues"),
  },
  (table) => [index("schema_blocks_page_id_idx").on(table.auditPageId)],
);

export const brandSignals = pgTable(
  "brand_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    status: text("status").notNull(),
    score: real("score"),
    evidence: jsonb("evidence"),
  },
  (table) => [index("brand_signals_audit_id_idx").on(table.auditId)],
);

export const platformScores = pgTable(
  "platform_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    score: real("score"),
    breakdown: jsonb("breakdown"),
  },
  (table) => [index("platform_scores_audit_id_idx").on(table.auditId)],
);

/** V5.5 — prompts we track share-of-answer for, per brand. */
export const trackedPrompts = pgTable(
  "tracked_prompts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    /** suggested | user */
    source: text("source").notNull().default("suggested"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("tracked_prompts_brand_id_idx").on(table.brandId)],
);

/** V5.5 — one row per prompt × engine per run; share-of-answer derives from these. */
export const answerRuns = pgTable(
  "answer_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => trackedPrompts.id, { onDelete: "cascade" }),
    /** chatgpt | perplexity | gemini */
    engine: text("engine").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
    answerExcerpt: text("answer_excerpt"),
    brandMentioned: boolean("brand_mentioned").notNull().default(false),
    brandCited: boolean("brand_cited").notNull().default(false),
    /** Per-competitor { mentioned, cited } flags. */
    mentions: jsonb("mentions"),
  },
  (table) => [
    index("answer_runs_brand_id_idx").on(table.brandId),
    index("answer_runs_prompt_id_idx").on(table.promptId),
  ],
);

/** V8.3 — standalone Toolbox runs (per-run priced). Findings still go to audit_findings. */
export const toolRuns = pgTable(
  "tool_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    input: jsonb("input"),
    result: jsonb("result"),
    score: real("score"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("tool_runs_workspace_id_idx").on(table.workspaceId)],
);

/** V8.5 — Claudia's per-category visibility autonomy (0 monitor · 1 propose · 2 auto-apply). */
export const agentAutonomy = pgTable(
  "agent_autonomy",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    level: integer("level").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("agent_autonomy_brand_category_unique").on(table.brandId, table.category)],
);

/** V7.4 — agency CRM prospects (optional tier). */
export const prospects = pgTable(
  "prospects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url"),
    score: real("score"),
    /** lead | qualified | proposal | won | lost */
    stage: text("stage").notNull().default("lead"),
    mrr: real("mrr"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("prospects_workspace_id_idx").on(table.workspaceId)],
);

/** V6.6 — daily traffic proof from GSC / GA4. Idempotent per (brand, source, date). */
export const trafficSnapshots = pgTable(
  "traffic_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** gsc | ga4 */
    source: text("source").notNull(),
    /** ISO date (YYYY-MM-DD) of the snapshot. */
    date: text("date").notNull(),
    clicks: integer("clicks"),
    impressions: integer("impressions"),
    avgPosition: real("avg_position"),
    /** Per-engine AI-referral sessions (GA4). */
    aiReferrals: jsonb("ai_referrals"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("traffic_snapshots_brand_id_idx").on(table.brandId),
    uniqueIndex("traffic_snapshots_brand_source_date_unique").on(table.brandId, table.source, table.date),
  ],
);

/**
 * V6.6 connect — maps a brand to the Google property it pulls traffic proof from.
 * The OAuth grant (access/refresh tokens) lives in better-auth's `account` table;
 * we only store which user's grant to refresh and which site/property this brand
 * uses. One row per (brand, source). No secrets here.
 */
export const trafficConnections = pgTable(
  "traffic_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** gsc | ga4 */
    source: text("source").notNull(),
    /** The user whose Google grant this connection refreshes (better-auth `account.userId`). */
    connectedByUserId: text("connected_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** GSC verified site URL (e.g. "https://example.com/" or "sc-domain:example.com"). */
    siteUrl: text("site_url"),
    /** GA4 numeric property id (e.g. "123456789"). */
    propertyId: text("property_id"),
    /** Last successful sync + last error, for the card's status line. */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("traffic_connections_brand_id_idx").on(table.brandId),
    uniqueIndex("traffic_connections_brand_source_unique").on(table.brandId, table.source),
  ],
);
