/**
 * @file src/databases/mongodb/mongo-db-adapter.ts
 * @description MongoDB adapter for SveltyCMS - Modularized version.
 */

import { MongoAdapterCore } from "./adapter/adapter-core";
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

import { MongoCrudModule } from "./modules/crud-module";
import { MongoAuthModule } from "./modules/auth-module";
import { MongoContentModule } from "./modules/content-module";
import { MongoMediaModule } from "./modules/media-module";
import { MongoSystemModule } from "./modules/system-module";
import { MongoMonitoringModule } from "./modules/monitoring-module";
import { MongoCollectionModule } from "./modules/collection-module";
import { MongoBatchModule } from "./modules/batch-module";
import { MongoTransactionModule } from "./modules/transaction-module";
import { MongoQueryBuilder } from "./mongo-query-builder";

export class MongoDBAdapter extends MongoAdapterCore implements IDBAdapter {
  public readonly type = "mongodb";

  // Domain-Specific Adapters (Modules)
  crud: ICrudAdapter;
  auth: IAuthAdapter;
  content: IContentAdapter;
  media: IMediaAdapter;
  system: ISystemAdapter;
  monitoring: IMonitoringAdapter;
  collection: ICollectionAdapter;
  batch: IDBAdapter["batch"];
  private transactionModule: MongoTransactionModule;

  constructor() {
    super();
    // Initialize Modules
    this.crud = new MongoCrudModule(this);
    this.auth = new MongoAuthModule(this);
    this.content = new MongoContentModule(this);
    this.media = new MongoMediaModule(this);
    this.system = new MongoSystemModule(this);
    this.monitoring = new MongoMonitoringModule(this);
    this.collection = new MongoCollectionModule(this);
    this.batch = new MongoBatchModule(this) as any;
    this.transactionModule = new MongoTransactionModule(this);
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

  async getCollectionData(
    collectionName: string,
    options?: {
      limit?: number;
      offset?: number;
      fields?: string[];
      sort?: { field: string; direction: "asc" | "desc" };
      filter?: Record<string, unknown>;
      includeMetadata?: boolean;
    },
  ): Promise<
    DatabaseResult<{
      data: unknown[];
      metadata?: { totalCount: number; schema?: unknown; indexes?: string[] };
    }>
  > {
    const filter = options?.filter || {};
    const countRes = await this.crud.count(collectionName, filter as any);
    if (!countRes.success) return countRes as any;

    const dataRes = await this.crud.findMany(collectionName, filter as any, {
      limit: options?.limit,
      offset: options?.offset,
      fields: options?.fields as any,
      sort: options?.sort as any,
    });
    if (!dataRes.success) return dataRes as any;

    return {
      success: true,
      data: {
        data: dataRes.data as unknown[],
        metadata: options?.includeMetadata
          ? {
              totalCount: countRes.data,
            }
          : undefined,
      },
    };
  }

  async getMultipleCollectionData(
    collectionNames: string[],
    options?: { limit?: number; fields?: string[] },
  ): Promise<DatabaseResult<Record<string, unknown[]>>> {
    const results: Record<string, unknown[]> = {};
    for (const name of collectionNames) {
      const res = await this.crud.findMany(
        name,
        {},
        { limit: options?.limit, fields: options?.fields as any },
      );
      if (res.success) {
        results[name] = res.data;
      }
    }
    return { success: true, data: results };
  }

  public utils = {
    generateId: () => {
      const { generateId } = require("./methods/mongodb-utils");
      return generateId();
    },
    normalizePath: (path: string) => {
      const { normalizePath } = require("./methods/mongodb-utils");
      return normalizePath(path);
    },
    validateId: (id: string) => {
      const { validateId } = require("./methods/mongodb-utils");
      return validateId(id);
    },
    createPagination: <T>(items: T[], options: any) => {
      const { createPagination } = require("./methods/mongodb-utils");
      return createPagination(items, options);
    },
  };
}
