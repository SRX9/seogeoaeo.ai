import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./app";

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Per-brand autonomy: "FULL_AUTO" auto-publishes the agent's articles,
    // "REVIEW" leaves them as drafts. Each brand (site) runs independently;
    // billing is the only setting shared across a workspace's brands.
    autonomyMode: text("autonomy_mode").notNull().default("FULL_AUTO"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("brands_workspace_id_idx").on(table.workspaceId),
    // A workspace can't have two brands with the same name (case-insensitive).
    uniqueIndex("brands_workspace_name_unique").on(table.workspaceId, sql`lower(${table.name})`),
  ],
);

export const brandProfiles = pgTable(
  "brand_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    productDescription: text("product_description"),
    audience: text("audience"),
    tone: text("tone"),
    website: text("website"),
    seedKeywords: text("seed_keywords"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("brand_profiles_brand_id_idx").on(table.brandId)],
);

export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    rssUrl: text("rss_url"),
    sitemapUrl: text("sitemap_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("competitors_brand_id_idx").on(table.brandId)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    configJson: text("config_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("integrations_brand_provider_idx").on(table.brandId, table.provider)],
);

export const integrationSecrets = pgTable(
  "integration_secrets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => integrations.id, { onDelete: "cascade" }),
    secretKey: text("secret_key").notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("integration_secrets_key_idx").on(table.integrationId, table.secretKey)],
);
