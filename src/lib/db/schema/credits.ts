import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { workspaces } from "./app";
import { brands } from "./brand";

/**
 * Append-only ledger of every credit movement (grants, purchases, spends). The
 * authoritative balance lives on `subscriptions`; this table is the audit trail
 * and powers per-feature spend analytics. Grants/purchases are workspace-level
 * (brandId null); spends are brand-scoped. `refId` drives webhook idempotency.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
    // Signed change: positive for grants/purchases, negative for spends.
    delta: integer("delta").notNull(),
    // Snapshot of total available (monthly + purchased) after this entry.
    balanceAfter: integer("balance_after"),
    reason: text("reason").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("credit_ledger_workspace_created_idx").on(table.workspaceId, table.createdAt)],
);
