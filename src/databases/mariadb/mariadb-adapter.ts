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
  DatabaseId,
  DatabaseResult,
  IDBAdapter,
  PaginationOption,
  QueryBuilder,
  Tenant,
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
import { VirtualFoldersModule } from "./virtual-folders-module";
import { ThemesModule } from "./themes-module";
import { WebsiteTokensModule } from "./tokens-module";
import { WidgetsModule } from "./widgets-module";
import { BatchModule } from "./batch-module";

import { CacheModule } from "./cache-module";
import { PerformanceModule } from "./performance-module";
import { MariaDBQueryBuilder } from "./maria-db-query-builder";
import { getDefaultRoles } from "../auth/default-roles";
import type * as schema from "./schema";
import * as utils from "./utils";
import { AdapterCore } from "./adapter-core";

export class MariaDBAdapter extends AdapterCore implements IDBAdapter {
  public readonly type = "mariadb";

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
      tenants: {
        create: async (tenant: any) =>
          this.wrap(async () => {
            const id = (tenant._id || utils.generateId()) as string;
            const now = new Date();
            const values: typeof schema.tenants.$inferInsert = {
              ...tenant,
              _id: id,
              createdAt: now,
              updatedAt: now,
            };
            await this.pool!.query(
              `INSERT INTO tenants (_id, name, ownerId, status, plan, quota, \`usage\`, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                values.name,
                values.ownerId,
                values.status,
                values.plan,
                JSON.stringify(values.quota),
                JSON.stringify(values.usage),
                JSON.stringify(values.settings),
                now,
                now,
              ],
            );
            const [rows] = await this.pool!.query("SELECT * FROM tenants WHERE _id = ?", [id]);
            const result = (rows as Record<string, unknown>[])[0];
            return utils.parseJsonField(result, [
              "quota",
              "usage",
              "settings",
            ]) as unknown as Tenant;
          }, "TENANT_CREATE_FAILED"),
        getById: async (tenantId: DatabaseId) =>
          this.wrap(async () => {
            const [rows] = await this.pool!.query("SELECT * FROM tenants WHERE _id = ?", [
              tenantId as string,
            ]);
            const result = (rows as Record<string, unknown>[])[0];
            if (!result) return null;
            return utils.parseJsonField(result, [
              "quota",
              "usage",
              "settings",
            ]) as unknown as Tenant;
          }, "TENANT_GET_FAILED"),
        update: async (tenantId: DatabaseId, data: any) =>
          this.wrap(async () => {
            const now = new Date();
            const setClauses: string[] = ["updatedAt = ?"];
            const values: unknown[] = [now];
            for (const [key, value] of Object.entries(data)) {
              if (key === "_id") continue;
              setClauses.push(`\`${key}\` = ?`);
              values.push(
                ["quota", "usage", "settings"].includes(key) ? JSON.stringify(value) : value,
              );
            }
            values.push(tenantId as string);
            await this.pool!.query(
              `UPDATE tenants SET ${setClauses.join(", ")} WHERE _id = ?`,
              values,
            );
            const [rows] = await this.pool!.query("SELECT * FROM tenants WHERE _id = ?", [
              tenantId as string,
            ]);
            const result = (rows as Record<string, unknown>[])[0];
            return utils.parseJsonField(result, [
              "quota",
              "usage",
              "settings",
            ]) as unknown as Tenant;
          }, "TENANT_UPDATE_FAILED"),
        delete: async (tenantId: DatabaseId) =>
          this.wrap(async () => {
            await this.pool!.query("DELETE FROM tenants WHERE _id = ?", [tenantId as string]);
          }, "TENANT_DELETE_FAILED"),
        list: async (options?: PaginationOption) =>
          this.wrap(async () => {
            let query = "SELECT * FROM tenants";
            const params: unknown[] = [];
            if (options?.limit) {
              query += " LIMIT ?";
              params.push(options.limit);
            }
            if (options?.offset) {
              query += " OFFSET ?";
              params.push(options.offset);
            }
            const [rows] = await this.pool!.query(query, params);
            return (rows as Record<string, unknown>[]).map((r) =>
              utils.parseJsonField(r, ["quota", "usage", "settings"]),
            ) as unknown as Tenant[];
          }, "TENANT_LIST_FAILED"),
      },
    } as any);
  }

  public get monitoring(): IMonitoringAdapter {
    return (this._monitoring ??= {
      performance: new PerformanceModule(this),
      cache: new CacheModule(),
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
    });
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
    const db = this.db;
    if (!db) return;

    // Check if roles exist
    const { roles } = await import("./schema");
    const existingRoles = await db.select().from(roles).limit(1);
    if (existingRoles.length > 0) {
      return;
    }

    const now = new Date();
    const rolesPayload: (typeof roles.$inferInsert)[] = getDefaultRoles().map((role) => ({
      ...role,
      createdAt: now,
      updatedAt: now,
    })) as any;

    await db.insert(roles).values(rolesPayload);
  }

  public async ensureSystem(): Promise<void> {
    return Promise.resolve();
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
      connectionOrOptions as string | import("mysql2/promise").PoolOptions,
      options,
    );
    if (result.success && this.pool) {
      const { runMigrations } = await import("./migrations");
      const migrationResult = await runMigrations(this.pool);
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

  public async disconnect(): Promise<DatabaseResult<void>> {
    // Clear shared SQL adapter caches
    this.collectionRegistry.clear();
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
        "DELETE FROM auth_tokens WHERE (expires < NOW()) OR (consumed = TRUE AND updatedAt < DATE_SUB(NOW(), INTERVAL 24 HOUR))",
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
