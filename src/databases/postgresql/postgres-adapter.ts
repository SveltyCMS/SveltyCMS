import type { IDBAdapter, IMonitoringAdapter, DatabaseResult, BaseEntity } from "../db-interface";
import { PostgresAdapterCore } from "./adapter-core";
import * as utils from "../core/relational-utils";
import { PostgresQueryBuilder } from "./postgres-query-builder";

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
      const migrationResult = await runMigrations(this.sql);
      if (!migrationResult.success) {
        return {
          success: false,
          message: "Migration failed",
          error: utils.createDatabaseError(
            "MIGRATION_FAILED",
            migrationResult.error || "Unknown migration error",
          ),
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
      const tables = rows.map((r: any) => r.table_name);

      if (tables.length > 0) {
        // Drop all tables with CASCADE to handle foreign keys
        for (const table of tables) {
          await this.sql.unsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        }
      }

      // Re-run migrations to recreate the schema
      const { runMigrations } = await import("./migrations");
      const migrationResult = await runMigrations(this.sql);
      if (!migrationResult.success) {
        throw new Error(migrationResult.error || "Migration failed after clearing database");
      }
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
