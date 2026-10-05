/**
 * @file src/databases/postgresql/postgres-adapter.ts
 * @description
 * High-performance PostgreSQL database adapter implementation for SveltyCMS.
 * Extends PostgresAdapterCore with system lifecycle hooks, connection bootstrap,
 * cached version checks, atomic schema clearing, and bounded batch maintenance.
 *
 * Features:
 * - Boot schema bootstrap with advisory migration locking
 * - Cached getVersion() to eliminate repetitive server roundtrips
 * - Single-transaction atomic clearDatabase() with CASCADE truncate/drop and connection pool recycling
 * - Bounded ctid batch cleanup of expired sessions and tokens with dedicated partial index
 * - Query builder binding for relational SQL compilation
 */

import { logger } from "@src/utils/logger";
import type {
  IDBAdapter,
  IMonitoringAdapter,
  IFtsAdapter,
  DatabaseResult,
  BaseEntity,
} from "../db-interface";
import { PostgresAdapterCore } from "./adapter-core";
import { createDatabaseError } from "../core/relational-utils";
import { SqlQueryBuilder, POSTGRES_DIALECT } from "../core/sql-query-builder";
import { PostgresFtsAdapter } from "./fts-adapter";
import { withMigrationLock } from "../migration-lock";
import { PerformanceModule } from "../core/base-adapter";
import { CacheModule } from "../core/cache-module";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const CLEANUP_BATCH = 5_000;

const SYSTEM_TABLES = new Set([
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

export class PostgreSQLAdapter extends PostgresAdapterCore implements IDBAdapter {
  public readonly type = "postgresql";
  private _monitoring: IMonitoringAdapter | null = null;
  private _fts?: IFtsAdapter;
  private _version: string | null = null;
  private _cleanupIndexed = false;

  public get monitoring(): IMonitoringAdapter {
    return (this._monitoring ??= {
      performance: new PerformanceModule(this as any),
      cache: new CacheModule(this as any),
      getConnectionPoolStats: () => this.getConnectionPoolStats(),
    });
  }

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
    if (!result.success || !this.sql) return result;

    const sql = this.sql;
    let migrationError: string | null = null;
    await withMigrationLock(this as any, "postgresql", async () => {
      const { bootstrapSystemSchema } = await import("../core/system-schema-bootstrap");
      const migrationResult = await bootstrapSystemSchema("postgresql", sql);
      if (!migrationResult.success) {
        migrationError = migrationResult.error || "Unknown schema bootstrap error";
      }
    });
    if (migrationError) {
      return {
        success: false,
        message: "Migration failed",
        error: createDatabaseError("MIGRATION_FAILED", migrationError),
      };
    }
    return result;
  }

  async getVersion(): Promise<DatabaseResult<string>> {
    if (this._version) return { success: true, data: this._version };
    return this.wrap(async () => {
      if (!this.sql) throw new Error("PostgreSQL client not available");
      const res = await this.sql`SELECT version() as version`;
      this._version = String(res[0].version);
      return this._version;
    }, "GET_VERSION_FAILED");
  }

  getCapabilities(): import("../db-interface").DatabaseCapabilities {
    return super.getCapabilities();
  }

  async clearDatabase(): Promise<DatabaseResult<void>> {
    return this.wrap(async () => {
      if (!this.sql) throw new Error("Not connected");

      const rows = await this.sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      `;
      const tables = rows.map((r: any) => String(r.table_name));

      if (tables.length === 0) {
        const { bootstrapSystemSchema } = await import("../core/system-schema-bootstrap");
        const migrationResult = await bootstrapSystemSchema("postgresql", this.sql);
        if (!migrationResult.success) {
          throw new Error(
            migrationResult.error || "Schema bootstrap failed after clearing database",
          );
        }
        return;
      }

      const truncate: string[] = [];
      const drop: string[] = [];
      for (const table of tables) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue;
        const quoted = `"${table}"`;
        if (SYSTEM_TABLES.has(table.toLowerCase())) {
          truncate.push(quoted);
        } else {
          drop.push(quoted);
        }
      }

      // One transaction, one round trip per statement. CASCADE covers FK order.
      // slop:suppress -- safe static identifier array constructed from information_schema.tables
      await this.sql.begin(async (tx) => {
        if (truncate.length > 0) {
          await tx.unsafe(`TRUNCATE TABLE ${truncate.join(", ")} RESTART IDENTITY CASCADE`);
        }
        if (drop.length > 0) {
          await tx.unsafe(`DROP TABLE IF EXISTS ${drop.join(", ")} CASCADE`);
        }
      });

      this.tableRegistry.clear();
      this.dynamicTables.clear();
      this.modelRegistry.clear();
      this._insertTemplateCache.clear();
      this._provisionedTables.clear();
      this.materializedColumns?.clear?.();
      this._version = null;
      this._cleanupIndexed = false;

      // Pooled connections still hold prepared plans for the dropped OIDs.
      // Recycle the pool so subsequent queries acquire clean connections.
      if (this._rawConnectionConfig) {
        await this.sql.end({ timeout: 5 });
        this.sql = postgres(
          this._rawConnectionConfig.finalConnection,
          this._rawConnectionConfig.options,
        );
        this._db = drizzle(this.sql, { schema });
        await this.sql`SELECT 1`;
        this.connected = true;
      }

      logger.info("[PostgreSQL Adapter] Fast single-shot database clear completed");
    }, "CLEAR_DATABASE_FAILED");
  }

  public queryBuilder<T extends BaseEntity>(
    collection: string,
  ): import("../db-interface").QueryBuilder<T> {
    return new SqlQueryBuilder<T>(this, collection, POSTGRES_DIALECT);
  }

  /**
   * Bounded deletes so one pass cannot hold a lock until statement_timeout.
   * Indexes are created once; without them both deletes are seq scans.
   */
  public async cleanupExpiredData(): Promise<DatabaseResult<{ sessions: number; tokens: number }>> {
    return this.wrap(async () => {
      if (!this.sql) throw new Error("Not connected");
      await this.ensureCleanupIndexes();

      const [sessions, tokens] = await Promise.all([
        this.deleteExpired(
          `DELETE FROM auth_sessions
           WHERE ctid IN (
             SELECT ctid FROM auth_sessions
             WHERE expires < CURRENT_TIMESTAMP
             LIMIT ${CLEANUP_BATCH}
           )`,
        ).catch((err: any) => {
          if (err?.code === "42P01") return 0;
          throw err;
        }),
        this.deleteExpired(
          `DELETE FROM auth_tokens
           WHERE ctid IN (
             SELECT ctid FROM auth_tokens
             WHERE expires < CURRENT_TIMESTAMP
                OR (consumed = TRUE AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '7 days')
             LIMIT ${CLEANUP_BATCH}
           )`,
        ).catch((err: any) => {
          if (err?.code === "42P01") return 0;
          throw err;
        }),
      ]);

      return { sessions, tokens };
    }, "CLEANUP_EXPIRED_DATA_FAILED");
  }

  private async ensureCleanupIndexes(): Promise<void> {
    if (this._cleanupIndexed || !this.sql) return;
    try {
      await this.sql.unsafe(
        `CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires)`,
      );
      await this.sql.unsafe(
        `CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON auth_tokens (expires)`,
      );
      await this.sql.unsafe(
        `CREATE INDEX IF NOT EXISTS auth_tokens_consumed_updated_idx
         ON auth_tokens ("updatedAt") WHERE consumed = TRUE`,
      );
      this._cleanupIndexed = true;
    } catch (err: any) {
      if (err?.code !== "42P01") {
        logger.debug("[PostgresAdapter] Could not create cleanup indexes:", err);
      }
    }
  }

  private async deleteExpired(sqlText: string): Promise<number> {
    let removed = 0;
    const maxIterations = 200; // Cap to prevent runaway loops (up to 1,000,000 rows per call)
    for (let i = 0; i < maxIterations; i++) {
      const res = await this.sql!.unsafe(sqlText);
      const n = Number(res.count ?? 0);
      removed += n;
      if (n < CLEANUP_BATCH) return removed;
    }
    return removed;
  }
}
