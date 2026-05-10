import type {
  IDBAdapter,
  IAuthAdapter,
  IContentAdapter,
  IMediaAdapter,
  ISystemAdapter,
  IMonitoringAdapter,
  ICollectionAdapter,
  DatabaseResult,
  BaseEntity,
} from "../db-interface";
import { PostgresAdapterCore } from "./adapter-core";
import * as utils from "../core/relational-utils";
import { AuthModule } from "./auth-module";
import { ContentModule } from "./content-module";
import { MediaModule } from "./media-module";
import { BatchModule } from "./batch-module";
import { CollectionModule } from "./collection-module";
import { PreferencesModule } from "./preferences-module";
import { VirtualFoldersModule } from "./virtual-folders-module";
import { ThemesModule } from "./themes-module";
import { WidgetsModule } from "./widgets-module";
import { WebsiteTokensModule } from "./tokens-module";
import { JobsModule } from "./jobs-module";
import { PerformanceModule } from "./performance-module";
import { CacheModule } from "./cache-module";
import { PostgresQueryBuilder } from "./postgres-query-builder";

export class PostgreSQLAdapter extends PostgresAdapterCore implements IDBAdapter {
  public readonly type = "postgresql";

  // Public interface modules (Lazy-loaded via Getters)
  public get auth(): IAuthAdapter {
    return (this._auth ??= new AuthModule(this));
  }

  public get content(): IContentAdapter {
    return (this._content ??= new ContentModule(this));
  }

  public get media(): IMediaAdapter {
    return (this._media ??= new MediaModule(this));
  }

  public get collection(): ICollectionAdapter {
    return (this._collection ??= new CollectionModule(this) as any);
  }

  public get batch(): IDBAdapter["batch"] {
    return (this._batch ??= new BatchModule(this) as any);
  }

  public get system(): ISystemAdapter {
    return (this._system ??= {
      preferences: new PreferencesModule(this),
      virtualFolder: new VirtualFoldersModule(this),
      themes: new ThemesModule(this),
      widgets: new WidgetsModule(this),
      websiteTokens: new WebsiteTokensModule(this),
      jobs: new JobsModule(this),
      tenants: {
        create: async (_tenant: any) => this.notImplemented("system.tenants.create"),
        getById: async (_tenantId: any) => this.notImplemented("system.tenants.getById"),
        update: async (_tenantId: any, _data: any) => this.notImplemented("system.tenants.update"),
        delete: async (_tenantId: any) => this.notImplemented("system.tenants.delete"),
        list: async (_options: any) => this.notImplemented("system.tenants.list"),
      },
    } as any);
  }

  public get monitoring(): IMonitoringAdapter {
    return (this._monitoring ??= {
      performance: new PerformanceModule(this),
      cache: new CacheModule(this),
      getConnectionPoolStats: async () => this.getConnectionPoolStats(),
    });
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
