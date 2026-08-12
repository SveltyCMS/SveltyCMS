/**
 * @file src/databases/mariadb/adapter/index.ts
 * @description Main MariaDB adapter class that composes feature modules and entry point.
 *
 * Features:
 * - CRUD operations
 * - Authentication
 * - Content management
 * - Media management
 * - System preferences
 * - Virtual folders
 * - Themes
 * - Widgets
 * - Website tokens
 * - Batch operations
 * - Transactions
 * - Performance monitoring
 * - Cache management
 * - Collection management
 * - Query builder
 */

import type {
  BaseEntity,
  DatabaseResult,
  IDBAdapter,
  IFtsAdapter,
  QueryBuilder,
  IMonitoringAdapter,
} from "../db-interface";
import { SqlQueryBuilder, MARIADB_DIALECT } from "../core/sql-query-builder";
import { AdapterCore } from "./adapter-core";
import { MariaDBFtsAdapter } from "./fts-adapter";
import { logger } from "@src/utils/logger";
import { withMigrationLock } from "../migration-lock";

function quoteMariaIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

export class MariaDBAdapter extends AdapterCore implements IDBAdapter {
  public readonly type = "mariadb";
  private _monitoring: any = null;

  public get monitoring(): IMonitoringAdapter {
    if (!this._monitoring) {
      const { PerformanceModule } = require("../core/performance-module");
      const { CacheModule } = require("../core/cache-module");
      this._monitoring = {
        performance: new PerformanceModule(this as any),
        cache: new CacheModule(this as any),
        getConnectionPoolStats: async () =>
          this.wrap(async () => {
            if (!this.pool)
              return {
                total: 0,
                active: 0,
                idle: 0,
                waiting: 0,
                avgConnectionTime: 0,
              };
            return {
              total: (this.pool as any)._allConnections?.length || 10,
              active:
                (this.pool as any)._allConnections?.length -
                  (this.pool as any)._freeConnections?.length || 0,
              idle: (this.pool as any)._freeConnections?.length || 0,
              waiting: (this.pool as any)._connectionQueue?.length || 0,
              avgConnectionTime: 0,
            };
          }, "POOL_STATS_FAILED"),
      };
    }
    return this._monitoring;
  }

  private _fts?: IFtsAdapter;

  public get fts(): IFtsAdapter {
    return (this._fts ??= new MariaDBFtsAdapter(this as unknown as IDBAdapter));
  }

  constructor(_config: any = {}) {
    super();
  }

  async connect(
    connection: string | import("mysql2/promise").PoolOptions,
    options?: unknown,
  ): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions?: import("../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  public async connect(
    connectionOrOptions?:
      | string
      | import("mysql2/promise").PoolOptions
      | import("../db-interface").ConnectionPoolOptions,
    options?: unknown,
  ): Promise<DatabaseResult<void>> {
    const result = await super.connect(connectionOrOptions as any, options);
    if (result.success && this.pool) {
      const { bootstrapSystemSchema } = await import("../core/system-schema-bootstrap");
      const pool = this.pool; // narrowed non-null for the lock closure
      // 🛡️ HARDENING: Advisory lock so only one instance runs boot provisioning
      let migrationError: string | null = null;
      await withMigrationLock(this as any, "mariadb", async () => {
        const migrationResult = await bootstrapSystemSchema("mariadb", pool);
        if (!migrationResult.success) {
          migrationError = migrationResult.error || "Unknown schema bootstrap error";
        }
      });
      if (migrationError) {
        return {
          success: false,
          message: "Migration failed",
          error: {
            code: "MIGRATION_FAILED",
            message: migrationError,
          } as any,
        };
      }
    }
    return result;
  }

  public async disconnect(): Promise<DatabaseResult<void>> {
    // Clear shared SQL adapter caches
    this.tableRegistry.clear();
    this.dynamicTables.clear();

    return super.disconnect();
  }

  public async clearDatabase(): Promise<DatabaseResult<void>> {
    return this.wrap(async () => {
      if (!this.pool) {
        throw new Error("Not connected");
      }

      const [rows] = await this.pool.query("SHOW TABLES");
      const tables = (rows as Record<string, string>[]).map((row) => Object.values(row)[0]);

      if (tables.length === 0) {
        const { bootstrapSystemSchema } = await import("../core/system-schema-bootstrap");
        const migrationResult = await bootstrapSystemSchema("mariadb", this.pool);
        if (!migrationResult.success) {
          throw new Error(
            migrationResult.error || "Schema bootstrap failed after empty database reset",
          );
        }
        return;
      }

      await this.pool.query("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const table of tables) {
          const name = String(table);
          const normalized = name.toLowerCase();
          const quoted = quoteMariaIdentifier(name);

          const isDynamicCollection = normalized.startsWith("collection_");
          const isBenchmarkTable =
            normalized.startsWith("bench_") || normalized.startsWith("benchmark_");
          const isMockTable = normalized.includes("mock") || normalized.includes("test_");

          if (isDynamicCollection || isBenchmarkTable || isMockTable) {
            await this.pool.query(`DROP TABLE IF EXISTS ${quoted}`);
          } else {
            await this.pool.query(`TRUNCATE TABLE ${quoted}`);
          }
        }
      } finally {
        await this.pool.query("SET FOREIGN_KEY_CHECKS = 1");
      }

      this.tableRegistry.clear();
      this.dynamicTables.clear();
      this.modelRegistry.clear();
      this._tableColumnsCache.clear();
      this._selectionCache.clear();

      logger.info("[MariaDB Adapter] Database tables cleared/dropped (resilient clear)");
    }, "CLEAR_DATABASE_FAILED");
  }

  /**
   * Cleanup expired sessions and tokens (TTL-equivalent for SQL databases).
   * MongoDB handles this automatically via TTL indexes; SQL databases need manual cleanup.
   * @returns Number of rows cleaned up
   */
  public async cleanupExpiredData(): Promise<DatabaseResult<{ sessions: number; tokens: number }>> {
    return this.wrap(async () => {
      if (!this.pool) throw new Error("Not connected");
      const [sessionResult] = await this.pool.query(
        "DELETE FROM auth_sessions WHERE expires < NOW()",
      );
      const [tokenResult] = await this.pool.query(
        "DELETE FROM auth_tokens WHERE (expires < NOW()) OR (consumed = TRUE AND updatedAt < DATE_SUB(NOW(), INTERVAL 7 DAY))",
      );
      const sessions = (sessionResult as { affectedRows?: number }).affectedRows || 0;
      const tokens = (tokenResult as { affectedRows?: number }).affectedRows || 0;
      return { sessions, tokens };
    }, "CLEANUP_EXPIRED_DATA_FAILED");
  }

  public queryBuilder = <T extends BaseEntity>(collection: string): QueryBuilder<T> => {
    return new SqlQueryBuilder<T>(this, collection, MARIADB_DIALECT);
  };

  public async getVersion(): Promise<DatabaseResult<string>> {
    return this.wrap(async () => {
      if (!this.pool) throw new Error("MariaDB pool not available");
      const [rows] = await this.pool.query("SELECT version() as version");
      return (rows as any)[0].version as string;
    }, "GET_VERSION_FAILED");
  }
}

export * from "./adapter-core";
