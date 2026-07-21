import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Public messages submitted from the Contact page for the support team to handle. */
export const contactInquiries = pgTable(
  "contact_inquiries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    category: text("category").notNull().default("other"),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("contact_inquiries_status_created_idx").on(table.status, table.createdAt),
    check("contact_inquiries_status_check", sql`${table.status} in ('open','resolved')`),
    check(
      "contact_inquiries_category_check",
      sql`${table.category} in ('account_billing','product_support','privacy_data','partnerships_press','other')`,
    ),
  ],
);
