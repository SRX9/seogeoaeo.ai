import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./app";
import { brands } from "./brand";

export const agentJobs = pgTable(
  "agent_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("running"),
    message: text("message"),
    metadataJson: text("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("agent_jobs_brand_id_idx").on(table.brandId)],
);

/**
 * Claudia's one-time Setup Run (AP2): the ignition pipeline that onboards a new
 * brand without user steps. One row per brand; `stepsJson` holds the ordered
 * per-step statuses the progress UI renders, and the row is the idempotency
 * anchor — a re-fired run resumes from the first non-done step.
 */
export const setupRuns = pgTable(
  "setup_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** running | completed | failed */
    status: text("status").notNull().default("running"),
    /** Ordered array of { key, status: "pending"|"running"|"done"|"failed"|"skipped", note? }. */
    stepsJson: text("steps_json").notNull(),
    /** Day-0 brief in Claudia's voice, written by the final step. */
    briefText: text("brief_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("setup_runs_brand_id_idx").on(table.brandId)],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    weekStart: text("week_start").notNull(),
    articlesGenerated: integer("articles_generated").notNull().default(0),
    articlesPublished: integer("articles_published").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("usage_counters_brand_week_idx").on(table.brandId, table.weekStart)],
);

/**
 * One row per brand per UTC day, written by the daily content-agent cron. It is
 * the source of truth for "what did the agent do today" — used to enforce the
 * per-plan daily article cap idempotently (so a re-fired cron can't double-write)
 * and to surface the agent's current state on the dashboard.
 */
export const agentDailyRuns = pgTable(
  "agent_daily_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** UTC calendar day, "YYYY-MM-DD". */
    runDate: text("run_date").notNull(),
    articlesWritten: integer("articles_written").notNull().default(0),
    topicsResearched: integer("topics_researched").notNull().default(0),
    /** active | paused_no_credits | idle | no_topics */
    status: text("status").notNull().default("active"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // The unique (brand_id, run_date) index also serves brand_id-prefixed lookups,
  // so no separate brand_id index is needed.
  (table) => [uniqueIndex("agent_daily_runs_brand_date_idx").on(table.brandId, table.runDate)],
);
