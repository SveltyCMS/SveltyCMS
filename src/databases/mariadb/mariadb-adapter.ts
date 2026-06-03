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
  QueryBuilder,
  IMonitoringAdapter,
} from "../db-interface";
import { MariaDBQueryBuilder } from "./maria-db-query-builder";
import { AdapterCore } from "./adapter-core";

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
    const result = await super.connect(
      connectionOrOptions as any,
      options,
    );
    if (result.success && this.pool) {
      const { runMigrations } = await import("./migrations");
      const migrationResult = await runMigrations(this.pool);
      if (!migrationResult.success) {
        return {
          success: false,
          message: "Migration failed",
          error: {
            code: "MIGRATION_FAILED",
            message: migrationResult.error || "Unknown migration error",
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
      // Get all tables
      const [rows] = await this.pool.query("SHOW TABLES");
      const tables = (rows as Record<string, string>[]).map((row) => Object.values(row)[0]);

      if (tables.length > 0) {
        await this.pool.query("SET FOREIGN_KEY_CHECKS = 0");
        for (const table of tables) {
          await this.pool.query(`DROP TABLE IF EXISTS \`${table}\``);
        }
        await this.pool.query("SET FOREIGN_KEY_CHECKS = 1");
      }

      // CRITICAL: Re-run migrations to recreate the schema
      const { runMigrations } = await import("./migrations");
      await runMigrations(this.pool);
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
    return new MariaDBQueryBuilder<T>(this, collection);
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
