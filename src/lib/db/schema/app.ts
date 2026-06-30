import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  name: text("name").notNull(),
  // Deprecated: autonomy moved to a per-brand setting (`brands.autonomy_mode`).
  // Kept (unused) to avoid a destructive migration; safe to drop in a later one.
  autonomyMode: text("autonomy_mode").notNull().default("FULL_AUTO"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planId: text("plan_id").notNull().default("free"),
  status: text("status").notNull().default("inactive"),
  // Deprecated: weekly article caps were replaced by the credit balance below.
  // Kept (unused) to avoid a destructive migration; safe to drop in a later one.
  weeklyArticleCap: integer("weekly_article_cap").notNull().default(0),
  // Credit balance. `monthlyCredits` is the plan allowance and is reset to
  // `monthlyCreditGrant` every billing cycle (use-it-or-lose-it).
  // `purchasedCredits` (signup grant + top-up packs) never expires. Total
  // available = monthlyCredits + purchasedCredits; spends drain monthly first.
  monthlyCredits: integer("monthly_credits").notNull().default(0),
  purchasedCredits: integer("purchased_credits").notNull().default(0),
  monthlyCreditGrant: integer("monthly_credit_grant").notNull().default(0),
  creditsRefreshedAt: timestamp("credits_refreshed_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Last time we emailed the owner that the agent paused for lack of credits.
  // Throttles the notification; cleared on any credit top-up so a fresh
  // low-credit episode re-notifies.
  lastLowCreditEmailAt: timestamp("last_low_credit_email_at", { withTimezone: true }),
  // When false, the owner has opted out of the agent's low/out-of-credits emails.
  creditEmailsEnabled: boolean("credit_emails_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
