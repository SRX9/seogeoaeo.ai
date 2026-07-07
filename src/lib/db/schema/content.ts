import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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

/**
 * C2 — the brand's Search Console query×page report, refreshed weekly (28-day
 * window, top rows by impressions). Feeds the striking-distance/CTR-gap/family
 * topic mining plays and C4's article performance checkpoints. Rows for a
 * period are replaced wholesale on sync; the unique index backstops races.
 */
export const searchQueries = pgTable(
  "search_queries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    page: text("page").notNull(),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    position: real("position"),
    /** ISO dates (YYYY-MM-DD), matching traffic_snapshots' convention. */
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("search_queries_brand_id_idx").on(table.brandId),
    uniqueIndex("search_queries_brand_query_page_period_idx").on(
      table.brandId,
      table.query,
      table.page,
      table.periodStart,
    ),
  ],
);

/**
 * C4 — article performance checkpoints. Each published article is read at
 * day 7 / 28 / 90 from the C2 `search_queries` report (page + target-query
 * family) and given a verdict that drives the loop: winner → follow-up
 * topics; stalling → title/meta + answer-block fixes; dead → deprioritize
 * the family. Unique (article, day) = the checkpoint runner's idempotency.
 */
export const performanceCheckpoints = pgTable(
  "performance_checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    /** 7 | 28 | 90 — days since first publish. */
    day: integer("day").notNull(),
    impressions: integer("impressions"),
    clicks: integer("clicks"),
    position: real("position"),
    /** winner | stalling | dead | watching (null metrics = GSC not connected). */
    verdict: text("verdict"),
    /** What the verdict dispatched: follow-up topic ids / finding count / family. */
    actionsJson: text("actions_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("performance_checkpoints_brand_id_idx").on(table.brandId),
    uniqueIndex("performance_checkpoints_article_day_idx").on(table.articleId, table.day),
  ],
);

/**
 * C4 — learned per-source topic weights (bounded 0.5–2.0, shrink toward 1 on
 * small samples). Multiplied into research scoring so sources that keep
 * producing winners for this brand rise and dead-end sources sink.
 */
export const topicSourceWeights = pgTable(
  "topic_source_weights",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    weight: real("weight").notNull().default(1),
    /** Checkpoints behind the weight — shown in the backlog UI for transparency. */
    sample: integer("sample").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("topic_source_weights_brand_source_idx").on(table.brandId, table.source)],
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
