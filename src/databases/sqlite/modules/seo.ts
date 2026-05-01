import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Redirects Materialized View (MV) Schema
 * Used for high-performance redirect lookups.
 */
export const redirectsMV = sqliteTable(
  "redirects_mv",
  {
    _id: text("_id", { length: 36 }).primaryKey(),
    tenantId: text("tenantId", { length: 36 }).notNull(),
    from: text("from").notNull(),
    to: text("to").notNull(),
    type: integer("type").notNull().default(301),
    isRegex: integer("isRegex", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    metadata: text("metadata", { mode: "json" }),
  },
  (table) => ({
    tenantIdx: index("redirects_mv_tenant_idx").on(table.tenantId),
    fromIdx: index("redirects_mv_from_idx").on(table.from),
  }),
);
