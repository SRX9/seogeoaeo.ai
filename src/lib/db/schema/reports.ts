import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./app";
import { brands } from "./brand";

/**
 * AP5: the weekly report archive. One row per (workspace, audited site,
 * ISO-Monday week): `bodyJson` holds the structured WeeklyReportData so
 * /reports re-renders it with the same renderer that produced the email. Keyed
 * by SITE, not brand: a site whose brand profile doesn't resolve still gets
 * its report, and two sites sharing one brand each get their own. The unique
 * index doubles as the send-idempotency guard (insert-first, email-second,
 * stamp `emailedAt`): a re-fired Monday cron resumes at unstamped rows
 * instead of re-emailing.
 */
export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Attribution only: null when no brand profile matches the site's apex. */
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
    /** The audited site this report covers (audits.siteUrl). */
    siteUrl: text("site_url").notNull().default(""),
    /** ISO date (YYYY-MM-DD) of the week's Monday: getWeekStart(). */
    weekStart: text("week_start").notNull(),
    subject: text("subject").notNull(),
    bodyJson: jsonb("body_json").notNull(),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("weekly_reports_site_week_idx").on(table.workspaceId, table.siteUrl, table.weekStart),
  ],
);
