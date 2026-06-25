/**
 * @file src/databases/postgresql/404-logs.ts
 * @description Defines the PostgreSQL ORM schema for the 404 request logs collection.
 * This model ensures the table schema is correctly registered with the PostgreSQL adapter,
 * adhering to the principle of database agnosticism.
 */

// NOTE: We assume the use of a PostgreSQL-compatible ORM schema builder (e.g., Drizzle's pg dialect).
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 404 Logs Collection Schema
 * Records unmatched paths encountered by the middleware, helping track user navigation patterns
 * and identifying areas where redirects or new content are needed.
 * This table is automatically created/migrated when the 404 module is initialized.
 */
export const fourOhFourLogs = pgTable("collection_404_logs", {
  /**
   * The unique identifier for the log entry (auto-incrementing).
   */
  id: serial("id").primaryKey(),

  /**
   * The path that resulted in a 404 error.
   */
  path: text("path").notNull(),

  /**
   * The tenant ID context where the 404 occurred.
   */
  tenantId: text("tenantId").notNull(),

  /**
   * The number of times this specific path has been hit.
   */
  hits: integer("hits").default(1).notNull(),

  /**
   * The last time this path was successfully logged.
   * PostgreSQL standard uses timestamp with timezone.
   */
  lastHit: timestamp("lastHit").defaultNow().notNull(),

  /**
   * Optional metadata regarding the source of the request (e.g., IP, user agent).
   */
  metadata: text("metadata"),
});
