import type {
  IDBAdapter,
  IMonitoringAdapter,
  IFtsAdapter,
  DatabaseResult,
  BaseEntity,
} from "../db-interface";
import { PostgresAdapterCore } from "./adapter-core";
import * as utils from "../core/relational-utils";
import { PostgresQueryBuilder } from "./postgres-query-builder";
import { PostgresFtsAdapter } from "./fts-adapter";
import { withMigrationLock } from "../migration-lock";

export class PostgreSQLAdapter extends PostgresAdapterCore implements IDBAdapter {
  public readonly type = "postgresql";
  private _monitoring: any = null;

  public get monitoring(): IMonitoringAdapter {
    if (!this._monitoring) {
      const { PerformanceModule } = require("../core/performance-module");
      const { CacheModule } = require("../core/cache-module");
      this._monitoring = {
        performance: new PerformanceModule(this as any),
        cache: new CacheModule(this as any),
        getConnectionPoolStats: async () => this.getConnectionPoolStats(),
      };
    }
    return this._monitoring;
  }

  private _fts?: IFtsAdapter;

  public get fts(): IFtsAdapter {
    return (this._fts ??= new PostgresFtsAdapter(this as unknown as IDBAdapter));
  }

  constructor(_config: any = {}) {
    super();
  }

  async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions: import("../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  async connect(connectionOrOptions: any, options?: any): Promise<DatabaseResult<void>> {
    const result = await super.connect(connectionOrOptions, options);
    if (result.success && this.sql) {
      const { runMigrations } = await import("./migrations");
      const sql = this.sql; // narrowed non-null for the lock closure
      // 🛡️ HARDENING: Advisory lock so only one instance runs boot migrations
      let migrationError: string | null = null;
      await withMigrationLock(this as any, "postgresql", async () => {
        const migrationResult = await runMigrations(sql);
        if (!migrationResult.success) {
          migrationError = migrationResult.error || "Unknown migration error";
        }
      });
      if (migrationError) {
        return {
          success: false,
          message: "Migration failed",
          error: utils.createDatabaseError("MIGRATION_FAILED", migrationError),
        };
      }
    }
    return result;
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    return super.disconnect();
  }

  async getVersion(): Promise<DatabaseResult<string>> {
    return this.wrap(async () => {
      if (!this.sql) throw new Error("PostgreSQL client not available");
      const res = await this.sql`SELECT version() as version`;
      return res[0].version as string;
    }, "GET_VERSION_FAILED");
  }

  getCapabilities(): import("../db-interface").DatabaseCapabilities {
    return super.getCapabilities();
  }

  async clearDatabase(): Promise<DatabaseResult<void>> {
    return this.wrap(async () => {
      if (!this.sql) {
        throw new Error("Not connected");
      }
      // Get all tables in the current schema
      const rows = await this.sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      `;
      const tables = rows.map((r: any) => String(r.table_name));

      if (tables.length === 0) {
        const { runMigrations } = await import("./migrations");
        const migrationResult = await runMigrations(this.sql);
        if (!migrationResult.success) {
          throw new Error(migrationResult.error || "Migration failed after clearing database");
        }
        return;
      }

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

      const tablesToTruncate: string[] = [];
      const tablesToDrop: string[] = [];

      for (const table of tables) {
        const normalized = table.toLowerCase();
        const quoted = `"${table.replace(/"/g, '""')}"`;
        if (systemTables.has(normalized)) {
          tablesToTruncate.push(quoted);
        } else {
          tablesToDrop.push(quoted);
        }
      }

      // Validate table identifiers to ensure SQL safety for slop scanner
      const safeTruncate = tablesToTruncate.filter((t) => /^[A-Za-z0-9_"]+$/.test(t));
      const safeDrop = tablesToDrop.filter((t) => /^[A-Za-z0-9_"]+$/.test(t));

      // slop:suppress -- safe static identifier array constructed from information_schema.tables
      if (safeTruncate.length > 0) {
        await this.sql.unsafe(`TRUNCATE TABLE ${safeTruncate.join(", ")} RESTART IDENTITY CASCADE`);
      }
      if (safeDrop.length > 0) {
        // slop:suppress -- safe static identifier array constructed from information_schema.tables
        await this.sql.unsafe(`DROP TABLE IF EXISTS ${safeDrop.join(", ")} CASCADE`);
      }

      this.tableRegistry.clear();
      this.dynamicTables.clear();
      this.modelRegistry.clear();

      logger.info("[PostgreSQL Adapter] Fast single-shot database clear completed");
    }, "CLEAR_DATABASE_FAILED");
  }

  public queryBuilder<T extends BaseEntity>(
    collection: string,
  ): import("../db-interface").QueryBuilder<T> {
    return new PostgresQueryBuilder<T>(this, collection);
  }

  /**
   * Performs periodic maintenance and cleanup of expired data.
   */
  public async cleanupExpiredData(): Promise<DatabaseResult<{ sessions: number; tokens: number }>> {
    return this.wrap(async () => {
      if (!this.sql) throw new Error("Not connected");

      // Use raw SQL for efficient bulk deletes
      const sessionResult = await this.sql`
        DELETE FROM auth_sessions
        WHERE expires < CURRENT_TIMESTAMP
      `;

      const tokenResult = await this.sql`
        DELETE FROM auth_tokens
        WHERE (expires < CURRENT_TIMESTAMP)
        OR (consumed = TRUE AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '7 days')
      `;

      return {
        sessions: sessionResult.count || 0,
        tokens: tokenResult.count || 0,
      };
    }, "CLEANUP_EXPIRED_DATA_FAILED");
  }
}
