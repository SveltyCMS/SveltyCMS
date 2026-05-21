/**
 * @file src/databases/sqlite/sqlite-adapter.ts
 * @description Standard SQLite database adapter for SveltyCMS.
 */

import type { IDBAdapter, DatabaseResult } from "../db-interface";
import { logger } from "@src/utils/logger";
import { SQLiteAdapterCore } from "./adapter-core";

export class SQLiteAdapter extends SQLiteAdapterCore implements IDBAdapter {
  constructor(_config: any = {}) {
    super();
  }
  public readonly type = "sqlite";

  public async clearDatabase(): Promise<DatabaseResult<void>> {
    return SQLiteAdapterCore.writeMutex.runExclusive(() =>
      this.wrap(async () => {
        // Support both Bun (query) and Node/better-sqlite3 (prepare)
        let tables: { name: string }[];
        if (this.sqlite.query) {
          tables = this.sqlite
            .query(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
            )
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

        this.sqlite.exec("PRAGMA foreign_keys = OFF;");

        // 🛡️ SYSTEM TABLES PROTECTION: Do NOT drop critical infra tables
        // This ensures the server process remains stable during benchmarks.
        const systemTables = new Set([
          "auth_users",
          "auth_sessions",
          "auth_tokens",
          "roles",
          "content_nodes",
          "content_drafts",
          "content_revisions",
          "themes",
          "widgets",
          "media_items",
          "system_virtual_folders",
          "system_preferences",
          "svelty_jobs",
          "website_tokens",
          "tenants",
          "audit_logs",
          "404_logs",
          "redirects_mv",
          "workflow_definitions",
          "workflow_instances",
          "plugin_migrations",
          "plugin_states",
          "plugin_pagespeed_results",
        ]);

        for (const table of tables) {
          const name = table.name.toLowerCase();
          // ONLY drop collections, benchmarks, or explicit mock tables
          const isCollection = name.startsWith("collection_");
          const isBenchmark = name.startsWith("bench_") || name.startsWith("benchmark_");
          const isMock = name.includes("mock") || name.includes("test_");

          if ((isCollection || isBenchmark || isMock) && !systemTables.has(name)) {
            this.sqlite.exec(`DROP TABLE IF EXISTS "${table.name}"`);
          }
        }
        this.sqlite.exec("PRAGMA foreign_keys = ON;");

        // 🚀 HARDENING: Mark as not provisioned so system tables are re-created
        this._provisioned = false;
        this._provisionPromise = null;

        logger.info("[SQLite Adapter] Database tables dropped (resilient clear)");
      }, "CLEAR_DATABASE_FAILED"),
    );
  }
}
