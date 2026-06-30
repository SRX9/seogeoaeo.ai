import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  (table) => [
    index("credit_ledger_workspace_created_idx").on(table.workspaceId, table.createdAt),
    // Idempotency guard: a (workspace, reason, refId) tuple may appear at most once,
    // so a retried spend/grant keyed on the same refId can't double-apply. Partial
    // (refId nullable) because workspace-level movements without a ref are exempt.
    uniqueIndex("credit_ledger_ref_unique_idx")
      .on(table.workspaceId, table.reason, table.refId)
      .where(sql`${table.refId} is not null`),
  ],
);
