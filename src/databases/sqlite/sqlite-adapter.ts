/**
 * @file src/databases/sqlite/adapter/index.ts
 * @description Main SQLite adapter class.
 *
 * Features:
 * - CRUD operations
 * - Transactions
 * - Query builder
 * - Migrations
 * - Multi-tenancy
 */

import type {
  BaseEntity,
  DatabaseResult,
  IDBAdapter,
  QueryBuilder,
  IAuthAdapter,
  IContentAdapter,
  IMediaAdapter,
  ISystemAdapter,
  IMonitoringAdapter,
  ICollectionAdapter,
} from "../db-interface";
import { CollectionModule } from "./collection-module";
import { AuthModule } from "./auth-module";
import { ContentModule } from "./content-module";
import { MediaModule } from "./media-module";
import { PreferencesModule } from "./preferences-module";
import { JobsModule } from "./jobs-module";
import { TenantsModule } from "./tenants-module";
import { HealthModule } from "./health-module";
import { VirtualFoldersModule } from "./virtual-folders-module";
import { ThemesModule } from "./themes-module";
import { WebsiteTokensModule } from "./tokens-module";
import { WidgetsModule } from "./widgets-module";
import { BatchModule } from "./batch-module";
import { CacheModule } from "./cache-module";
import { PerformanceModule } from "./performance-module";
import { SQLiteQueryBuilder } from "./sq-lite-query-builder";
import { getDefaultRoles } from "../auth/default-roles";
import * as schema from "./schema";
import * as utils from "./utils";
import { AdapterCore } from "./adapter-core";

export class SQLiteAdapter extends AdapterCore implements IDBAdapter {
  public readonly type = "sqlite";

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
    return (this._collection ??= new CollectionModule(this));
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
      tenants: new TenantsModule(this),
      health: new HealthModule(this),
    } as any);
  }

  public get monitoring(): IMonitoringAdapter {
    return (this._monitoring ??= {
      performance: new PerformanceModule(this),
      cache: new CacheModule(this),
      getConnectionPoolStats: async () =>
        this.wrap(async () => {
          return {
            total: 1,
            active: 1,
            idle: 0,
            waiting: 0,
            avgConnectionTime: 0,
          };
        }, "POOL_STATS_FAILED"),
    } as any);
  }

  public readonly utils = utils;

  // Internal lazy modules
  private _auth?: IAuthAdapter;
  private _content?: IContentAdapter;
  private _media?: IMediaAdapter;
  private _collection?: ICollectionAdapter;
  private _batch?: IDBAdapter["batch"];
  private _system?: ISystemAdapter;
  private _monitoring?: IMonitoringAdapter;

  constructor() {
    super();
  }

  public async ensureAuth(): Promise<void> {
    if (!this.db) {
      logger.warn("[SQLiteAdapter] Cannot ensureAuth: Database not connected.");
      return;
    }
    // Check if roles exist
    const existingRoles = await this.db.select().from(schema.roles).limit(1);
    if (existingRoles.length > 0) {
      return;
    }

    const now = new Date();
    const rolesPayload: (typeof schema.roles.$inferInsert)[] = getDefaultRoles().map((role) => ({
      ...role,
      createdAt: now,
      updatedAt: now,
    })) as any;

    await this.db.insert(schema.roles).values(rolesPayload).onConflictDoNothing();
  }

  public async ensureSystem(): Promise<void> {
    // SQLite modules are pre-initialized in constructor
    // We can add system settings seeding here if needed in the future
    return Promise.resolve();
  }

  async connect(
    connection: string | { connectionString?: string; filename?: string },
    options?: unknown,
  ): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions?: import("../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  public async connect(
    connectionOrOptions?: any,
    _options?: unknown,
  ): Promise<DatabaseResult<void>> {
    const result = await super.connect(
      connectionOrOptions as string | { connectionString?: string; filename?: string },
    );
    if (result.success && this.sqlite) {
      const { runMigrations } = await import("./migrations");
      const migrationResult = await runMigrations(this.sqlite);
      if (!migrationResult.success) {
        return {
          success: false,
          message: "Migration failed",
          error: this.utils.createDatabaseError(
            "MIGRATION_FAILED",
            migrationResult.error || "Unknown migration error",
          ),
        };
      }
    }
    return result;
  }

  public async clearDatabase(): Promise<DatabaseResult<void>> {
    // SQLite-specific cleanup: Drop all tables
    return this.wrap(async () => {
      // Disable foreign keys to allow dropping tables in any order
      this.sqlite.exec("PRAGMA foreign_keys = OFF;");

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
        throw new Error(
          "SQLite adapter: Neither query() nor prepare() methods found on connection object.",
        );
      }

      for (const { name } of tables) {
        this.sqlite.exec(`DELETE FROM "${name}";`);
        try {
          this.sqlite.exec(`DELETE FROM sqlite_sequence WHERE name='${name}';`);
        } catch {
          // Ignore if sqlite_sequence doesn't exist or table not tracked
        }
      }

      this.sqlite.exec("PRAGMA foreign_keys = ON;");
    }, "CLEAR_DATABASE_FAILED");
  }

  /**
   * Cleanup expired sessions and tokens (TTL-equivalent for SQL databases).
   * MongoDB handles this automatically via TTL indexes; SQL databases need manual cleanup.
   */
  public async cleanupExpiredData(): Promise<DatabaseResult<{ sessions: number; tokens: number }>> {
    return this.wrap(async () => {
      const now = Date.now();
      const dayAgo = now - 86400000; // 24 hours in ms
      // Delete expired sessions
      const execQuery = (q: string, params: unknown[]): number => {
        if (this.sqlite.query) {
          const result = this.sqlite.query(q).run(...params) as unknown;
          return (result as { changes?: number })?.changes || 0;
        } else if (this.sqlite.prepare) {
          const result = this.sqlite.prepare(q).run(...params) as unknown;
          return (result as { changes?: number })?.changes || 0;
        }
        return 0;
      };
      const sessions = execQuery("DELETE FROM auth_sessions WHERE expires < ?", [now]);
      const tokens = execQuery(
        "DELETE FROM auth_tokens WHERE (expires < ?) OR (consumed = 1 AND updatedAt < ?)",
        [now, dayAgo],
      );
      return { sessions, tokens };
    }, "CLEANUP_EXPIRED_DATA_FAILED");
  }

  public queryBuilder = <T extends BaseEntity>(collection: string): QueryBuilder<T> => {
    return new SQLiteQueryBuilder<T>(this, collection);
  };

  public async getVersion(): Promise<DatabaseResult<string>> {
    return this.wrap(async () => {
      if (this.sqlite.query) {
        const res = this.sqlite.query("SELECT sqlite_version() as version").get() as {
          version: string;
        };
        return res.version;
      } else if (this.sqlite.prepare) {
        const res = this.sqlite.prepare("SELECT sqlite_version() as version").get() as {
          version: string;
        };
        return res.version;
      }
      throw new Error("SQLite client not available");
    }, "GET_VERSION_FAILED");
  }
}
