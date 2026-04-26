import type {
  IDBAdapter,
  ICrudAdapter,
  IAuthAdapter,
  IContentAdapter,
  IMediaAdapter,
  ISystemAdapter,
  IMonitoringAdapter,
  DatabaseResult,
  BaseEntity,
} from "../../db-interface";
import { AdapterCore } from "./adapter-core";
import * as utils from "../utils";
import { CrudModule } from "../crud/crud-module";
import { AuthModule } from "../modules/auth/auth-module";
import { ContentModule } from "../modules/content/content-module";
import { MediaModule } from "../modules/media/media-module";
import { BatchModule } from "../operations/batch-module";
import { CollectionModule } from "../collection/collection-module";
import { PreferencesModule } from "../modules/system/preferences-module";
import { VirtualFoldersModule } from "../modules/system/virtual-folders-module";
import { ThemesModule } from "../modules/themes/themes-module";
import { WidgetsModule } from "../modules/widgets/widgets-module";
import { WebsiteTokensModule } from "../modules/website/tokens-module";
import { JobsModule } from "../modules/system/jobs-module";
import { PerformanceModule } from "../performance/performance-module";
import { CacheModule } from "../performance/cache-module";
import { PostgresQueryBuilder } from "../query-builder/postgres-query-builder";
import { TransactionModule } from "../operations/transaction-module";
import { getDefaultRoles } from "../../auth/default-roles";
import { onConflictDoNothing } from "drizzle-orm/pg-core";
import * as schema from "../schema/index";

export class PostgreSQLAdapter extends AdapterCore implements IDBAdapter {
  public readonly type = "postgresql";
  public readonly system: ISystemAdapter;
  public readonly monitoring: IMonitoringAdapter;
  public readonly crud: ICrudAdapter;
  public readonly auth: IAuthAdapter;
  public readonly content: IContentAdapter;
  public readonly media: IMediaAdapter;
  public readonly batch: IDBAdapter["batch"];
  public readonly collection: IDBAdapter["collection"];
  public readonly utils = utils;
  private readonly transactionModule: TransactionModule;

  constructor() {
    super();
    this.crud = new CrudModule(this);
    this.auth = new AuthModule(this);
    this.content = new ContentModule(this);
    this.media = new MediaModule(this);
    this.batch = new BatchModule(this);
    this.collection = new CollectionModule(this);
    this.transactionModule = new TransactionModule(this);

    // Initialize nested adapters
    this.system = {
      preferences: new PreferencesModule(this),
      virtualFolder: new VirtualFoldersModule(this),
      themes: new ThemesModule(this),
      widgets: new WidgetsModule(this),
      websiteTokens: new WebsiteTokensModule(this),
      jobs: new JobsModule(this),
      tenants: {
        create: async (_tenant) => this.notImplemented("system.tenants.create"),
        getById: async (_tenantId) => this.notImplemented("system.tenants.getById"),
        update: async (_tenantId, _data) => this.notImplemented("system.tenants.update"),
        delete: async (_tenantId) => this.notImplemented("system.tenants.delete"),
        list: async (_options) => this.notImplemented("system.tenants.list"),
      },
    };

    this.monitoring = {
      performance: new PerformanceModule(this),
      cache: new CacheModule(this),
      getConnectionPoolStats: async () => this.getConnectionPoolStats(),
    };
  }

  public async ensureAuth(): Promise<void> {
    if (!this.db) {
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
    return Promise.resolve();
  }

  async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
  async connect(
    poolOptions: import("../../db-interface").ConnectionPoolOptions,
  ): Promise<DatabaseResult<void>>;
  async connect(connectionOrOptions: any, options?: any): Promise<DatabaseResult<void>> {
    const result = await super.connect(connectionOrOptions, options);
    if (result.success && this.sql) {
      const { runMigrations } = await import("../migrations");
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

  isConnected(): boolean {
    return super.isConnected();
  }

  async getVersion(): Promise<DatabaseResult<string>> {
    return this.wrap(async () => {
      if (!this.sql) throw new Error("PostgreSQL client not available");
      const res = await this.sql`SELECT version() as version`;
      return res[0].version as string;
    }, "GET_VERSION_FAILED");
  }

  getCapabilities(): import("../../db-interface").DatabaseCapabilities {
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
      const { runMigrations } = await import("../migrations");
      const migrationResult = await runMigrations(this.sql);
      if (!migrationResult.success) {
        throw new Error(migrationResult.error || "Migration failed after clearing database");
      }
    }, "CLEAR_DATABASE_FAILED");
  }

  async getCollectionData(
    collection: string,
    options?: {
      limit?: number;
      offset?: number;
      includeMetadata?: boolean;
      fields?: string[];
    },
  ): Promise<
    DatabaseResult<{
      data: unknown[];
      metadata?: { totalCount: number; schema?: unknown; indexes?: string[] };
    }>
  > {
    return this.wrap(async () => {
      const res = await this.crud.findMany<BaseEntity>(
        collection,
        {},
        options as { limit?: number; offset?: number; fields?: never[] },
      );
      if (!res.success) {
        throw new Error(res.message);
      }
      return {
        data: res.data ?? [],
        metadata: options?.includeMetadata ? { totalCount: res.data?.length ?? 0 } : undefined,
      };
    }, "GET_COLLECTION_DATA_FAILED");
  }

  async getMultipleCollectionData(
    collectionNames: string[],
    options?: { limit?: number; fields?: string[] },
  ): Promise<DatabaseResult<Record<string, unknown[]>>> {
    return this.wrap(async () => {
      const results: Record<string, unknown[]> = {};
      for (const name of collectionNames) {
        const res = await this.getCollectionData(name, {
          limit: options?.limit,
          fields: options?.fields,
        });
        if (res.success) {
          results[name] = res.data.data;
        }
      }
      return results;
    }, "GET_MULTIPLE_COLLECTION_DATA_FAILED");
  }

  queryBuilder<T extends BaseEntity>(
    collection: string,
  ): import("../../db-interface").QueryBuilder<T> {
    return new PostgresQueryBuilder<T>(this, collection);
  }

  async transaction<T>(
    fn: (
      transaction: import("../../db-interface").DatabaseTransaction,
    ) => Promise<DatabaseResult<T>>,
    options?: { timeout?: number; isolationLevel?: string },
  ): Promise<DatabaseResult<T>> {
    return this.transactionModule.execute(fn, options as any);
  }
}
