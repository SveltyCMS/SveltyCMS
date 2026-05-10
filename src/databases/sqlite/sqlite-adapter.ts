/**
 * @file src/databases/sqlite/sqlite-adapter.ts
 * @description Standard SQLite database adapter for SveltyCMS.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { BaseSqlAdapter } from "../core/base-sql-adapter";
import type { IDBAdapter, DatabaseResult } from "../db-interface";
import { logger } from "@src/utils/logger";
import { SQLiteAdapterCore } from "./adapter-core";

export class SQLiteAdapter extends SQLiteAdapterCore implements IDBAdapter {
  constructor(_config: any = {}) {
    super();
  }
  public readonly type = "sqlite";

  public async clearDatabase(): Promise<DatabaseResult<void>> {
    // 🚀 HARDENING: Use Truncate logic to avoid EBUSY file locks on Windows
    return this.wrap(async () => {
      // Support both Bun (query) and Node/better-sqlite3 (prepare)
      let tables: { name: string }[];
      if (this.sqlite.query) {
        tables = this.sqlite
          .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
          .all() as { name: string }[];
      } else if (this.sqlite.prepare) {
        tables = this.sqlite
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
          )
          .all() as { name: string }[];
      } else {
        return;
      }

      this.sqlite.run("PRAGMA foreign_keys = OFF;");
      for (const table of tables) {
        this.sqlite.run(`DELETE FROM "${table.name}"`);
        try {
          this.sqlite.run(`DELETE FROM sqlite_sequence WHERE name='${table.name}'`);
        } catch {
          /* ignore if sequence table missing */
        }
      }
      this.sqlite.run("PRAGMA foreign_keys = ON;");

      logger.info("[SQLite Adapter] Database truncated (resilient clear)");
    }, "CLEAR_DATABASE_FAILED");
  }

  public createDynamicTableDefinition(tableName: string) {
    // 🚀 HARDENING: Map dynamic system names to physical snake_case for migrations
    let physicalName = tableName;
    if (tableName === "redirectsMV" || tableName === "systemRedirects")
      physicalName = "system_redirects";
    else if (tableName === "auditLogs") physicalName = "audit_logs";
    else if (tableName === "pluginMigrations") physicalName = "plugin_migrations";
    else if (tableName === "pluginStates") physicalName = "plugin_states";

    return sqliteTable(physicalName, {
      _id: text("_id", { length: 36 }).primaryKey(),
      tenantId: text("tenantId", { length: 36 }),
      data: text("data", { mode: "json" }).notNull(),
      status: text("status").notNull().default("draft"),
      isDeleted: integer("isDeleted", { mode: "boolean" }).notNull().default(false),
      createdAt: integer("createdAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s','now')*1000)` as any),
      updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
        .notNull()
        .default(sql`(strftime('%s','now')*1000)` as any),
    });
  }

  protected getAliasedTable(collection: string): any {
    const schemaAny = this.schema as any;

    // 1. Check direct alias map
    const alias = BaseSqlAdapter.TABLE_ALIASES[collection];
    if (alias && schemaAny[alias]) return schemaAny[alias];

    // 2. Check if the name itself is a schema export
    if (schemaAny[collection]) return schemaAny[collection];

    return null;
  }
}
