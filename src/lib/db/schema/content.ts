import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./app";
import { brands } from "./brand";

export const researchRuns = pgTable(
  "research_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    summary: text("summary"),
    findingsJson: text("findings_json"),
    topicsCreated: integer("topics_created").notNull().default(0),
    // Caller-supplied key (the Workflow instance id) that makes a research run
    // idempotent: a retried step reuses the existing run + its topics instead of
    // re-discovering and inserting duplicates. Null for ad-hoc/manual runs.
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("research_runs_brand_id_idx").on(table.brandId),
    uniqueIndex("research_runs_idempotency_idx")
      .on(table.brandId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    researchRunId: uuid("research_run_id").references(() => researchRuns.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    angle: text("angle"),
    keywords: text("keywords"),
    score: integer("score"),
    rationale: text("rationale"),
    answerFit: text("answer_fit"),
    evidenceJson: text("evidence_json"),
    status: text("status").notNull().default("pending"),
    source: text("source").notNull().default("manual"),
    // C1 unified backlog fields: buyer intent drives ranking, and the thesis is
    // the one owner-readable line for why this topic will drive traffic.
    intentTier: text("intent_tier"),
    thesis: text("thesis"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("topics_brand_id_idx").on(table.brandId)],
);

/**
 * C1 competitor content index: every post we've seen on a competitor's blog,
 * classified once and diffed incrementally — new rows since the last crawl are
 * themselves a signal ("they just started covering X"). Only the topic and
 * intent ever reach a writing prompt, never their text.
 */
export const competitorContent = pgTable(
  "competitor_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    competitorName: text("competitor_name").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    topic: text("topic"),
    intent: text("intent"),
    shape: text("shape"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow().notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("competitor_content_brand_id_idx").on(table.brandId),
    uniqueIndex("competitor_content_brand_url_idx").on(table.brandId, table.url),
  ],
);

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    metaDescription: text("meta_description"),
    tags: text("tags"),
    bodyMarkdown: text("body_markdown").notNull(),
    status: text("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    // C3: the shape the outline step picked (direct-answer, tutorial, ...).
    shape: text("shape"),
    // C3 gate results (JSON array of { gate, passed, detail }) — shown in the
    // editor; a failing set means the draft was flagged for human review.
    gateResultsJson: text("gate_results_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("articles_brand_id_idx").on(table.brandId)],
);
