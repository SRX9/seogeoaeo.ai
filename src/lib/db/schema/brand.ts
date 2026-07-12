import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./app";
import type { BrandIntelligenceData } from "@/lib/brand/intelligence-types";

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
    // V8.6: opt-in for the public score badge. The /api/public/badge endpoint
    // only renders a score for domains whose brand flipped this on; default off
    // so a customer's audit score is never publicly readable unless they chose
    // to embed the badge.
    badgePublic: boolean("badge_public").notNull().default(false),
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
    // C3 structured voice doc (JSON: words we use/avoid, stance, examples,
    // rules learned from the user's edits). Grows via voice.ts, never via the
    // profile form: upsertBrandProfile must not touch it.
    voiceJson: text("voice_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("brand_profiles_brand_id_idx").on(table.brandId)],
);

/**
 * Context.dev's durable brand identity snapshot. The JSON payload retains every
 * extracted field while the small projected columns keep shell/dashboard reads
 * cheap. One row per brand is refreshed no more than once every 30 days.
 */
export const brandIntelligence = pgTable(
  "brand_intelligence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    title: text("title"),
    description: text("description"),
    slogan: text("slogan"),
    primaryLogoUrl: text("primary_logo_url"),
    primaryBackdropUrl: text("primary_backdrop_url"),
    data: jsonb("data").$type<BrandIntelligenceData>().notNull(),
    source: text("source").notNull().default("context.dev"),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }).notNull(),
    nextRefreshAt: timestamp("next_refresh_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("brand_intelligence_brand_id_idx").on(table.brandId),
    index("brand_intelligence_workspace_id_idx").on(table.workspaceId),
    index("brand_intelligence_next_refresh_idx").on(table.nextRefreshAt),
  ],
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

/**
 * C1 target-profile inventory: customer/user profiles most likely to need the
 * product, extracted at onboarding and owned by the user in Brand settings.
 * Shared context for research, writing, and comparison pages. Regeneration adds
 * rows but never overwrites rows the user touched (`edited`) or created
 * (`origin: "user"`).
 */
export const brandUseCases = pgTable(
  "brand_use_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    /** The need, problem, or buying situation for this profile. */
    job: text("job").notNull(),
    /** The customer or user profile to target. */
    persona: text("persona").notNull(),
    industry: text("industry"),
    /** Where the row came from ("stated on the pricing page"). */
    evidence: text("evidence"),
    origin: text("origin").notNull().default("generated"),
    enabled: boolean("enabled").notNull().default(true),
    edited: boolean("edited").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("brand_use_cases_brand_id_idx").on(table.brandId)],
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
