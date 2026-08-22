/**
 * @file src/databases/sqlite/sqlite-adapter.ts
 * @description
 * Standard SQLite database adapter for SveltyCMS.
 *
 * Responsibilities include:
 * - Connecting to SQLite database via native/shimmed drivers.
 * - Clearing collections and system database tables resiliently.
 *
 * ### Features:
 * - support for Bun native and node:sqlite drivers
 * - system and collection table cleanups
 */

import type { IDBAdapter, IFtsAdapter, DatabaseResult } from "../db-interface";
import { logger } from "@src/utils/logger";
import { SQLiteAdapterCore } from "./adapter-core";
import { SQLiteFtsAdapter } from "./fts-adapter";
import { PerformanceModule } from "../core/performance-module";
import { CacheModule } from "../core/cache-module";

export class SQLiteAdapter extends SQLiteAdapterCore implements IDBAdapter {
  private _monitoring: any = null;

  public get monitoring(): any {
    if (!this._monitoring) {
      this._monitoring = {
        performance: new PerformanceModule(this as any),
        cache: new CacheModule(this as any),
        getConnectionPoolStats: async () => this.getConnectionPoolStats(),
      };
    }
    return this._monitoring;
  }

  public async getConnectionPoolStats(): Promise<DatabaseResult<any>> {
    return {
      success: true,
      data: {
        total: 1,
        active: 0,
        idle: 1,
        waiting: 0,
        avgConnectionTime: 0,
      },
    };
  }

  private _fts?: IFtsAdapter;

  public get fts(): IFtsAdapter {
    return (this._fts ??= new SQLiteFtsAdapter(this as unknown as IDBAdapter));
  }

  constructor(_config: any = {}) {
    super();
  }
  public readonly type = "sqlite";

  public async clearDatabase(): Promise<DatabaseResult<void>> {
    return SQLiteAdapterCore.writeMutex.runExclusive(() =>
      this.wrap(async () => {
        // Support both Bun (query) and Node/node:sqlite (prepare)
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
          "auth_api_keys",
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
          "plugin_storage",
          "plugin_states",
          "plugin_pagespeed_results",
          "svelty_outbox",
        ]);

        for (const table of tables) {
          const name = table.name.toLowerCase();
          // ONLY drop collections, benchmarks, or explicit mock tables
          const isCollection = name.startsWith("collection_");
          const isBenchmark = name.startsWith("bench_") || name.startsWith("benchmark_");
          const isMock = name.includes("mock") || name.includes("test_");

          if ((isCollection || isBenchmark || isMock) && !systemTables.has(name)) {
            this.sqlite.exec(`DROP TABLE IF EXISTS "${table.name.replace(/"/g, '""')}"`);
          } else if (systemTables.has(name)) {
            this.sqlite.exec(`DELETE FROM "${table.name.replace(/"/g, '""')}"`);
          }
        }
        this.sqlite.exec("PRAGMA foreign_keys = ON;");

        // DDL dropped/cleared tables — cached prepared statements are stale
        this.clearStatementCaches();

        // 🚀 HARDENING: Mark as not provisioned so system tables are re-created
        this._provisioned = false;
        this._provisionPromise = null;
        // Collection tables were physically dropped — forget the cold-start
        // fast-path flags so createModel re-runs DDL on the next access.
        this._provisionedTables.clear();

        logger.info("[SQLite Adapter] Database tables cleared/dropped (resilient clear)");
      }, "CLEAR_DATABASE_FAILED"),
    );
  }

  /**
   * Cleanup expired sessions and tokens (TTL-equivalent for SQL databases).
   * MongoDB handles this automatically via TTL indexes; SQL databases need manual cleanup.
   * SQLite stores timestamps as INTEGER epoch milliseconds (Drizzle `timestamp_ms` mode).
   * @returns Number of rows cleaned up
   */
  public async cleanupExpiredData(): Promise<DatabaseResult<{ sessions: number; tokens: number }>> {
    return this.wrap(
      async () => {
        if (!this.sqlite) throw new Error("Not connected");
        const nowMs = Date.now();
        const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
        // Table/column names are hardcoded literals; only VALUES are bound
        // (no string interpolation — scanner-safe and injection-proof).
        const sessionResult = await this.raw.execute(
          `DELETE FROM auth_sessions WHERE "expires" < ?`,
          [nowMs],
        );
        const tokenResult = await this.raw.execute(
          `DELETE FROM auth_tokens WHERE ("expires" < ?) OR ("consumed" = 1 AND "updatedAt" < ?)`,
          [nowMs, sevenDaysAgoMs],
        );
        return {
          sessions: (sessionResult as { changes?: number })?.changes || 0,
          tokens: (tokenResult as { changes?: number })?.changes || 0,
        };
      },
      "CLEANUP_EXPIRED_DATA_FAILED",
      undefined,
      { isWrite: true },
    );
  }
}
