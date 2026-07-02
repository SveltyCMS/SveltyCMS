import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * 404 Logs Collection Schema
 * Records unmatched paths encountered by the middleware, helping track user navigation patterns
 * and identifying areas where redirects or new content are needed.
 */
export const fourOhFourLogs = sqliteTable(
  "404_logs",
  {
    /**
     * The unique identifier for the log entry (UUID string for consistency).
     */
    _id: text("_id", { length: 36 }).primaryKey(),

    /**
     * The path that resulted in a 404 error.
     */
    path: text("path").notNull(),

    /**
     * The tenant ID context where the 404 occurred.
     */
    tenantId: text("tenantId", { length: 36 }),

    /**
     * The number of times this specific path has been hit.
     */
    hits: integer("hits").default(1).notNull(),

    /**
     * The last time this path was successfully logged.
     */
    lastHit: integer("lastHit", { mode: "timestamp_ms" })
      .default(sql`(strftime('%s','now')*1000)`)
      .notNull(),

    /**
     * Optional metadata regarding the source of the request (e.g., IP, user agent).
     */
    metadata: text("metadata"),

    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .default(sql`(strftime('%s','now')*1000)`)
      .notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .default(sql`(strftime('%s','now')*1000)`)
      .notNull(),
  },
  (table) => ({
    pathIdx: index("four_oh_four_path_idx").on(table.path),
    tenantIdx: index("four_oh_four_tenant_idx").on(table.tenantId),
    pathTenantUnique: uniqueIndex("idx_404_logs_path_tenant").on(table.path, table.tenantId),
  }),
);
