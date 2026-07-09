import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { articles } from "./content";
import { workspaces } from "./app";
import { brands } from "./brand";

export const articlePublications = pgTable(
  "article_publications",
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
    provider: text("provider").notNull(),
    status: text("status").notNull().default("pending"),
    externalUrl: text("external_url"),
    /** Remote post id on the destination CMS (WP post id, Ghost id, etc.) for updates. */
    externalId: text("external_id"),
    errorMessage: text("error_message"),
    // Fingerprint of the article content at the last successful publish. Used to
    // skip re-publishing a destination when nothing has changed (avoids dupes,
    // e.g. dev.to's "title already used in the last five minutes" 422).
    publishedHash: text("published_hash"),
    attemptCount: integer("attempt_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("article_publications_article_provider_idx").on(table.articleId, table.provider),
  ],
);
