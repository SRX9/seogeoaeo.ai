import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { workspaces } from "./app";

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
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
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
