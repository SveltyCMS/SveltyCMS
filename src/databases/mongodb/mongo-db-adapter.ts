/**
 * @file src/databases/mongodb/mongo-db-adapter.ts
 * @description MongoDB adapter for SveltyCMS - Modularized version.
 */

import { MongoAdapterCore } from "./adapter-core";
import type {
  IDBAdapter,
  DatabaseResult,
  ICrudAdapter,
  IAuthAdapter,
  IContentAdapter,
  IMediaAdapter,
  ISystemAdapter,
  IMonitoringAdapter,
  ICollectionAdapter,
  BaseEntity,
  QueryBuilder,
} from "../db-interface";

import { MongoCrudModule } from "./crud-module";
import { MongoAuthModule } from "./auth-module";
import { MongoContentModule } from "./content-module";
import { MongoMediaModule } from "./media-module";
import { MongoSystemModule } from "./system-module";
import { MongoMonitoringModule } from "./monitoring-module";
import { MongoCollectionModule } from "./collection-module";
import { MongoBatchModule } from "./batch-module";
import { MongoTransactionModule } from "./transaction-module";
import { MongoQueryBuilder } from "./mongo-query-builder";
import { getDefaultRoles } from "../auth/default-roles";
import { generateId, normalizePath, validateId, createPagination } from "./mongodb-utils";

export class MongoDBAdapter extends MongoAdapterCore implements IDBAdapter {
  public readonly type = "mongodb";

  // Public interface modules (Lazy-loaded via Getters)
  public get crud(): ICrudAdapter {
    return (this._crud ??= new MongoCrudModule(this));
  }

  public get auth(): IAuthAdapter {
    return (this._auth ??= new MongoAuthModule(this));
  }

  public get content(): IContentAdapter {
    return (this._content ??= new MongoContentModule(this));
  }

  public get media(): IMediaAdapter {
    return (this._media ??= new MongoMediaModule(this));
  }

  public get system(): ISystemAdapter {
    return (this._system ??= new MongoSystemModule(this));
  }

  public get monitoring(): IMonitoringAdapter {
    return (this._monitoring ??= new MongoMonitoringModule(this));
  }

  public get collection(): ICollectionAdapter {
    return (this._collection ??= new MongoCollectionModule(this));
  }

  public get batch(): IDBAdapter["batch"] {
    return (this._batch ??= new MongoBatchModule(this) as any);
  }

  // Internal lazy modules
  private _crud?: ICrudAdapter;
  private _auth?: IAuthAdapter;
  private _content?: IContentAdapter;
  private _media?: IMediaAdapter;
  private _system?: ISystemAdapter;
  private _monitoring?: IMonitoringAdapter;
  private _collection?: ICollectionAdapter;
  private _batch?: IDBAdapter["batch"];
  private _transactionModule?: MongoTransactionModule;

  public get transactionModule(): MongoTransactionModule {
    return (this._transactionModule ??= new MongoTransactionModule(this));
  }

  constructor() {
    super();
  }

  async getVersion(): Promise<DatabaseResult<string>> {
    if (!this.isConnected()) return this.notConnectedError();
    try {
      const admin = this.connection!.db!.admin();
      const serverStatus = await admin.serverStatus();
      return { success: true, data: serverStatus.version };
    } catch (err: any) {
      return this.handleError(err, "GET_VERSION_FAILED");
    }
  }

  async clearDatabase(): Promise<DatabaseResult<void>> {
    if (!this.isConnected()) return this.notConnectedError();
    if (this.connection!.db) {
      await this.connection!.db.dropDatabase();
    }
    return { success: true, data: undefined };
  }

  async getConnectionHealth(): Promise<
    DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>
  > {
    return {
      success: true,
      data: {
        healthy: this.isConnected(),
        latency: 0,
        activeConnections: this.isConnected() ? 1 : 0,
      },
    };
  }

  async isEmpty(): Promise<DatabaseResult<boolean>> {
    if (!this.isConnected())
      return {
        success: false,
        message: "Not connected",
        error: { code: "NOT_CONNECTED", message: "Not connected" },
      };
    try {
      const collections = await this.connection!.db!.listCollections().toArray();
      return { success: true, data: collections.length === 0 };
    } catch (err: any) {
      return this.handleError(err, "CHECK_EMPTY_FAILED");
    }
  }

  queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T> {
    const model = this._getOrCreateModel(collection);
    return new MongoQueryBuilder<T>(model as any);
  }

  async transaction<T>(
    fn: (transaction: any) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    return this.transactionModule.execute(fn);
  }

  // Lifecycle methods to ensure specific domains are initialized
  async ensureSystem(): Promise<void> {
    // Logic moved to SystemModule, but we can call it if needed
  }

  async ensureAuth(): Promise<void> {
    if (this.auth && typeof (this.auth as any).setupAuthModels === "function") {
      await (this.auth as any).setupAuthModels();
    }

    // Seed roles if missing
    const rolesRes = await this.auth.getAllRoles({ bypassTenantCheck: true });
    if (rolesRes.length === 0) {
      const roles = getDefaultRoles();
      for (const role of roles) {
        const result = await this.auth.createRole({
          ...role,
          tenantId: "global", // Default tenant for system roles
        } as any);

        if (!result.success) {
          throw new Error(
            `Failed to seed role "${role.name}": ${result.error?.message || result.message}`,
          );
        }
      }
    }
  }

  async ensureCollections(): Promise<void> {
    // Logic handled in CollectionModule
  }

  async ensureMedia(): Promise<void> {
    // Logic handled in MediaModule
  }

  async ensureContent(): Promise<void> {
    // Logic handled in ContentModule
  }

  async ensureMonitoring(): Promise<void> {
    // Logic handled in MonitoringModule
  }

  public utils = {
    generateId: () => generateId(),
    normalizePath: (path: string) => normalizePath(path),
    validateId: (id: string) => validateId(id),
    createPagination: <T>(items: T[], options: any) => createPagination(items, options),
  };
}
