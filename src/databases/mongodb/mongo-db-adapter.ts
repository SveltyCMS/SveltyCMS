/**
 * @file src/databases/mongodb/mongo-db-adapter.ts
 * @description MongoDB adapter for SveltyCMS.
 */

import { BaseAdapter } from "../base-adapter";
import mongoose from "mongoose";
import type {
  ICrudAdapter,
  IDBAdapter,
  DatabaseResult,
  IAuthAdapter,
  ConnectionPoolOptions,
  IContentAdapter,
  IMediaAdapter,
  ISystemAdapter,
  IMonitoringAdapter,
  DatabaseId,
  BaseEntity,
  QueryBuilder,
  DatabaseTransaction,
  DatabaseCapabilities,
  Schema,
  PerformanceMetrics,
  QueryFilter,
} from "../db-interface";
import { MongoCrudMethods } from "./methods/crud-methods";
import { composeMongoAuthAdapter } from "./methods/auth-composition";
import { MongoQueryBuilder } from "./mongo-query-builder";
import { cacheService } from "@src/databases/cache/cache-service";
import { generateId, validateId } from "./methods/mongodb-utils";

export class MongoDBAdapter extends BaseAdapter implements IDBAdapter {
  private _connection: mongoose.Connection | null = null;
  private _models: Map<string, mongoose.Model<any>> = new Map();
  private _repos: Map<string, MongoCrudMethods<any>> = new Map();

  // Domain-Specific Adapters
  crud: ICrudAdapter;
  auth: IAuthAdapter;
  content: IContentAdapter = {} as IContentAdapter;
  media: IMediaAdapter = {} as IMediaAdapter;
  system: ISystemAdapter = {} as ISystemAdapter;
  monitoring: IMonitoringAdapter = {} as IMonitoringAdapter;
  batch: IDBAdapter["batch"] = {} as IDBAdapter["batch"];
  collection: IDBAdapter["collection"] = {} as IDBAdapter["collection"];

  constructor() {
    super();
    this.auth = composeMongoAuthAdapter();
    this.crud = this._createCrudMethods();

    // Initialize basic content interface (extended in ensureContent)
    this.content = {
      drafts: {
        restore: (id: DatabaseId) => this.crud.restore("content_drafts", id),
      },
      revisions: {
        restore: (id: DatabaseId) => this.crud.restore("content_revisions", id),
      },
    } as unknown as IContentAdapter;

    // Initialize basic media interface (extended in ensureMedia)
    this.media = {
      files: {
        restore: (id: DatabaseId, t: DatabaseId | null) =>
          this.crud.restore("media", id, { tenantId: t }),
      },
    } as unknown as IMediaAdapter;
  }

  /**
   * Internal helper to create the ICrudAdapter implementation.
   */
  private _createCrudMethods(): ICrudAdapter {
    const getRepo = (coll: string): MongoCrudMethods<any> => {
      if (this._repos.has(coll)) {
        return this._repos.get(coll)!;
      }

      const model = this._getOrCreateModel(coll);
      const repo = new MongoCrudMethods(model);
      this._repos.set(coll, repo);
      return repo;
    };

    return {
      aggregate: (c, p, o) => getRepo(c).aggregate(p as any[], o),
      count: (c, q, o) => getRepo(c).count(q || {}, o as any),
      delete: (c, id, o) => getRepo(c).delete(id, o as any),
      deleteMany: (c, q, o) => getRepo(c).deleteMany(q as QueryFilter<any>, o as any),
      exists: (c, q, o) => getRepo(c).exists(q || {}, o as any),
      findByIds: (c, ids, o) => getRepo(c).findByIds(ids, o as any),
      findMany: (c, q, o) => getRepo(c).findMany(q as QueryFilter<any>, o as any),
      findOne: (c, q, o) => getRepo(c).findOne(q as QueryFilter<any>, o as any),
      insert: (c, d, o) => getRepo(c).insert(d as any, o),
      insertMany: (c, d, o) => getRepo(c).insertMany(d as any[], o),
      restore: (c, id, o) => getRepo(c).restore(id, o as any) as any,
      update: (c, id, d, o) => getRepo(c).update(id, d as any, o),
      updateMany: (c, q, d, o) => getRepo(c).updateMany(q as QueryFilter<any>, d as any, o),
      upsert: (c, q, d, o) => getRepo(c).upsert(q as QueryFilter<any>, d as any, o),
      upsertMany: (c, items, o) => getRepo(c).upsertMany(items as any[], o),
    };
  }

  // Implementation of IDBAdapter methods
  async connect(
    connectionStringOrOptions: string | ConnectionPoolOptions,
    options?: mongoose.ConnectOptions,
  ): Promise<DatabaseResult<void>> {
    try {
      const connectionString =
        typeof connectionStringOrOptions === "string"
          ? connectionStringOrOptions
          : (connectionStringOrOptions as any).connectionString || "";

      // If already connected, just return success
      if (mongoose.connection.readyState === 1) {
        this._connection = mongoose.connection;
        this.connected = true;
        return { success: true, data: undefined };
      }

      // If already connecting, wait for it
      if (mongoose.connection.readyState === 2) {
        await new Promise((resolve, reject) => {
          const onConnected = () => {
            cleanup();
            resolve(true);
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const cleanup = () => {
            mongoose.connection.removeListener("connected", onConnected);
            mongoose.connection.removeListener("error", onError);
          };
          mongoose.connection.on("connected", onConnected);
          mongoose.connection.on("error", onError);
        });
        this._connection = mongoose.connection;
        this.connected = true;
        return { success: true, data: undefined };
      }

      // Otherwise, initiate new connection
      await mongoose.connect(connectionString, options || {});
      this._connection = mongoose.connection;
      this.connected = true;
      return { success: true, data: undefined };
    } catch (err: any) {
      this.connected = false;
      return {
        success: false,
        message: err.message,
        error: {
          code: "DB_CONNECTION_FAILED",
          message: err.message,
          originalCode: err.code || err.errno || err.originalError?.code,
          details: err,
        },
      };
    }
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    try {
      await mongoose.disconnect();
      this._connection = null;
      this.connected = false;
      return { success: true, data: undefined };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
        error: { code: "DB_DISCONNECT_FAILED", message: err.message },
      };
    }
  }

  override isConnected(): boolean {
    return !!this._connection && mongoose.connection.readyState === 1;
  }

  async getVersion(): Promise<DatabaseResult<string>> {
    if (!this.isConnected()) return this.notConnectedError();
    try {
      const admin = mongoose.connection.db!.admin();
      const serverStatus = await admin.serverStatus();
      return { success: true, data: serverStatus.version };
    } catch (err: any) {
      return this.handleError(err, "GET_VERSION_FAILED");
    }
  }

  async clearDatabase(): Promise<DatabaseResult<void>> {
    if (!this.isConnected())
      return {
        success: false,
        message: "Not connected",
        error: { code: "NOT_CONNECTED", message: "Not connected" },
      };
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    return { success: true, data: undefined };
  }

  getCapabilities(): DatabaseCapabilities {
    return {
      maxBatchSize: 1000,
      supportsTransactions: true,
      supportsAggregation: true,
      maxQueryComplexity: 100,
      supportsFullTextSearch: true,
      supportsIndexing: true,
      supportsPartitioning: false,
      supportsStreaming: true,
    };
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
    try {
      const model = this._getOrCreateModel(collectionName);
      let query = model.find(options?.filter || {});

      if (options?.fields) {
        query = query.select(options.fields.join(" "));
      }

      if (options?.sort) {
        query = query.sort({
          [options.sort.field]: options.sort.direction === "asc" ? 1 : -1,
        });
      }

      if (options?.offset) {
        query = query.skip(options.offset);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const [data, total] = await Promise.all([
        query.lean().exec(),
        options?.includeMetadata ? model.countDocuments(options?.filter || {}) : Promise.resolve(0),
      ]);

      return {
        success: true,
        data: {
          data: data as unknown[],
          metadata: options?.includeMetadata ? { totalCount: total } : undefined,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to get collection data for ${collectionName}`,
        error: {
          code: "COLLECTION_DATA_ERROR",
          message: error.message,
        },
      };
    }
  }

  async getConnectionHealth(): Promise<
    DatabaseResult<{
      healthy: boolean;
      latency: number;
      activeConnections: number;
    }>
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

  async getMultipleCollectionData(): Promise<DatabaseResult<Record<string, unknown[]>>> {
    return { success: true, data: {} };
  }

  queryBuilder<T extends BaseEntity>(collection: string): QueryBuilder<T> {
    const model = this._getOrCreateModel(collection);
    return new MongoQueryBuilder<T>(model as any);
  }

  async transaction<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await fn(session as unknown as DatabaseTransaction);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      return {
        success: false,
        message: error instanceof Error ? error.message : "Transaction failed",
        error: {
          code: "TRANSACTION_FAILED",
          message: error instanceof Error ? error.message : "Transaction failed",
        },
      };
    } finally {
      session.endSession();
    }
  }

  /**
   * Initializes system models and methods.
   */
  async ensureSystem(): Promise<void> {
    const { SystemSettingModel, SystemPreferencesModel, ThemeModel } = await import("./models");
    const { MongoSystemMethods } = await import("./methods/system-methods");
    const { MongoThemeMethods } = await import("./methods/theme-methods");
    const { MongoSystemVirtualFolderMethods } =
      await import("./methods/system-virtual-folder-methods");
    const { MongoWidgetMethods } = await import("./methods/widget-methods");
    const { WidgetModel } = await import("./models/widget");

    this.system.preferences = new MongoSystemMethods(SystemPreferencesModel, SystemSettingModel);
    this.system.themes = new MongoThemeMethods(ThemeModel) as any;
    this.system.virtualFolder = new MongoSystemVirtualFolderMethods();
    this.system.widgets = new MongoWidgetMethods(WidgetModel) as any;

    // Initialize tenants
    const { TenantModel } = await import("./models/tenant");
    const tenantRepo = new MongoCrudMethods(TenantModel);
    this.system.tenants = {
      create: (t) => tenantRepo.insert(t as any),
      getById: (id) => tenantRepo.findOne({ _id: id } as any),
      update: (id, d) => tenantRepo.update(id, d as any),
      delete: (id) => tenantRepo.delete(id),
      list: (o) => tenantRepo.findMany((o?.filter || {}) as any, o as any),
    };

    // Initialize jobs
    const { JobModel } = await import("./models/job");
    const jobRepo = new MongoCrudMethods(JobModel);
    this.system.jobs = {
      create: (j) => jobRepo.insert(j as any),
      getById: (id) => jobRepo.findOne({ _id: id } as any),
      getNextReady: (limit, tenantId) =>
        jobRepo.findMany(
          { status: "pending", nextRunAt: { $lte: new Date().toISOString() } } as any,
          { limit, tenantId } as any,
        ),
      list: (o) => jobRepo.findMany((o?.filter || {}) as any, o as any),
      count: (f) => jobRepo.count(f as any),
      update: (id, d) => jobRepo.update(id, d as any),
      delete: (id) => jobRepo.delete(id),
      cleanup: async (olderThan) => {
        const res = await jobRepo.deleteMany(
          { createdAt: { $lt: olderThan.toISOString() } } as any,
          {
            permanent: true,
          },
        );
        return res.success ? { success: true, data: res.data.deletedCount } : (res as any);
      },
    };
  }

  /**
   * Initializes auth models and methods.
   */
  async ensureAuth(): Promise<void> {
    if (this.auth && typeof (this.auth as any).setupAuthModels === "function") {
      await (this.auth as any).setupAuthModels();
    }
  }

  /**
   * Initializes collection models and methods.
   */
  async ensureCollections(): Promise<void> {
    const { MongoCollectionMethods } = await import("./methods/collection-methods");
    const collectionMethods = new MongoCollectionMethods();

    this.collection = {
      getModel: (id: string) => collectionMethods.getModel(id),
      createModel: (schema: Schema, force?: boolean) =>
        collectionMethods.createModel(schema, force),
      updateModel: (schema: Schema) => collectionMethods.updateModel(schema),
      deleteModel: (id: string) => collectionMethods.deleteModel(id),
      createIndexes: (id: string, schema: Schema) => {
        const model = collectionMethods.getMongooseModel(id);
        if (!model)
          return Promise.resolve({
            success: false,
            message: "Model not found",
            error: { code: "NOT_FOUND", message: "Model not found" },
          });
        return (collectionMethods as any)
          .createIndexes(model, schema)
          .then(() => ({ success: true, data: undefined }));
      },
      getSchema: (name: string, tenantId?: DatabaseId | null) =>
        collectionMethods.getSchema(name, tenantId).then((r) => ({ success: true, data: r })),
      getSchemaById: (id: string, tenantId?: DatabaseId | null) =>
        collectionMethods.getSchemaById(id, tenantId).then((r) => ({ success: true, data: r })),
      listSchemas: (tenantId?: DatabaseId | null) =>
        collectionMethods.listSchemas(tenantId).then((r) => ({ success: true, data: r })),
      getNativeDriverModel: async <TNative = any>(id: string) =>
        collectionMethods.getMongooseModel(id) as unknown as TNative,
    };
  }

  /**
   * Initializes media models and methods.
   */
  async ensureMedia(): Promise<void> {
    const { mediaSchema } = await import("./models/media");
    const { SystemVirtualFolderModel } = await import("./models/system-virtual-folder");
    const { MongoMediaMethods } = await import("./methods/media-methods");

    // Register media model directly
    if (!mongoose.models.media) {
      mongoose.model("media", mediaSchema);
    }

    // Register media_folders model if not already present
    if (!mongoose.models.media_folders) {
      mongoose.model("media_folders", SystemVirtualFolderModel.schema);
    }

    const MediaModel = mongoose.models.media;
    const mediaMethods = new MongoMediaMethods(MediaModel as any);
    const mediaAdapter = {
      files: {
        ...this.media.files,
        upload: (file: any, tenantId?: DatabaseId | null) =>
          mediaMethods.uploadMany([file], tenantId).then((res) => ({
            ...res,
            data: res.success ? res.data[0] : (undefined as any),
          })),
        uploadMany: mediaMethods.uploadMany.bind(mediaMethods),
        delete: (id: DatabaseId, tenantId?: DatabaseId | null) =>
          mediaMethods.deleteMany([id], tenantId).then((res) => ({
            ...res,
            data: undefined,
          })),
        deleteMany: mediaMethods.deleteMany.bind(mediaMethods),
        getMetadata: mediaMethods.getMetadata.bind(mediaMethods),
        updateMetadata: mediaMethods.updateMetadata.bind(mediaMethods),
        move: mediaMethods.move.bind(mediaMethods),
        duplicate: mediaMethods.duplicate.bind(mediaMethods),
        getByFolder: mediaMethods.getFiles.bind(mediaMethods),
        restore: (id: DatabaseId, tenantId?: DatabaseId | null) =>
          this.crud.restore("media", id, { tenantId }),
        search: (query: string, options?: any, tenantId?: DatabaseId | null) =>
          mediaMethods.getFiles(undefined, { ...options, search: query }, false, tenantId),
      },
      folders: {
        getTree: (_maxDepth?: number, tenantId?: DatabaseId | null) =>
          mediaMethods.getFolders(undefined, tenantId),
        getFolderContents: async (
          folderId?: DatabaseId,
          options?: any,
          tenantId?: DatabaseId | null,
        ) => {
          const [foldersRes, filesRes] = await Promise.all([
            mediaMethods.getFolders(folderId, tenantId),
            mediaMethods.getFiles(folderId, options, false, tenantId),
          ]);
          if (!foldersRes.success) return foldersRes as any;
          if (!filesRes.success) return filesRes as any;
          return {
            success: true,
            data: {
              folders: foldersRes.data,
              files: filesRes.data.items,
              totalCount: filesRes.data.total,
            },
          };
        },
        create: (folder: any, tenantId?: DatabaseId | null) =>
          this.crud.insert("media_folders", { ...folder, tenantId }),
        createMany: (folders: any[], tenantId?: DatabaseId | null) =>
          this.crud.insertMany(
            "media_folders",
            folders.map((f) => ({ ...f, tenantId })),
          ),
        delete: (id: DatabaseId, tenantId?: DatabaseId | null) =>
          this.crud.delete("media_folders", id, { tenantId }),
        deleteMany: (ids: DatabaseId[], tenantId?: DatabaseId | null) =>
          this.crud.deleteMany("media_folders", { _id: { $in: ids } } as any, { tenantId }),
        move: (id: DatabaseId, target: DatabaseId, tenantId?: DatabaseId | null) =>
          this.crud.update("media_folders", id, { parentId: target } as any, { tenantId }),
      },
      setupMediaModels: () => Promise.resolve(),
    } as unknown as IMediaAdapter;

    this.media = mediaAdapter;
  }

  /**
   * Initializes content models and methods.
   */
  async ensureContent(): Promise<void> {
    const { MongoContentMethods } = await import("./methods/content-methods");

    // Nodes Repo
    const nodeModel = this._getOrCreateModel("system_content_structure");
    const nodesRepo = new MongoCrudMethods(nodeModel);

    // Drafts Repo
    const draftModel = this._getOrCreateModel("content_drafts");
    const draftsRepo = new MongoCrudMethods(draftModel);

    // Revisions Repo
    const revisionModel = this._getOrCreateModel("content_revisions");
    const revisionsRepo = new MongoCrudMethods(revisionModel);

    const contentMethods = new MongoContentMethods(nodesRepo, draftsRepo, revisionsRepo);

    this.content = {
      ...this.content,
      nodes: {
        getStructure: contentMethods.getStructure.bind(contentMethods),
        create: (n: any) => contentMethods.upsertNodeByPath(n),
        createMany: (nodes: any[]) =>
          contentMethods.bulkUpdateNodes(nodes.map((n) => ({ path: n.path, changes: n }))),
        update: (path: string, changes: any) =>
          contentMethods.bulkUpdateNodes([{ path, changes }]).then((res) => ({
            ...res,
            data: res.success ? res.data[0] : (undefined as any),
          })),
        delete: (path: string) => contentMethods.deleteNodeByPath(path),
        deleteMany: (paths: string[], options?: { tenantId?: DatabaseId | null }) =>
          contentMethods.deleteNodesByPaths(paths, options),
        bulkUpdate: contentMethods.bulkUpdateNodes.bind(contentMethods),
        reorderStructure: contentMethods.reorderStructure.bind(contentMethods),
      },
      drafts: {
        ...this.content.drafts,
        create: contentMethods.createDraft.bind(contentMethods),
        createMany: (drafts: any[]) => draftsRepo.insertMany(drafts),
        update: (id: DatabaseId, data: any) => draftsRepo.update(id, { data } as any),
        publish: (id: DatabaseId) =>
          contentMethods.publishManyDrafts([id]).then((res) => ({ ...res, data: undefined })),
        publishMany: contentMethods.publishManyDrafts.bind(contentMethods),
        getForContent: contentMethods.getDraftsForContent.bind(contentMethods),
        delete: (id: DatabaseId) => draftsRepo.delete(id),
        deleteMany: (ids: DatabaseId[]) =>
          draftsRepo.deleteMany({ _id: { $in: ids } } as any, { permanent: true }),
      },
      revisions: {
        ...this.content.revisions,
        create: contentMethods.createRevision.bind(contentMethods),
        getHistory: contentMethods.getRevisionHistory.bind(contentMethods),
        delete: (id: DatabaseId) => revisionsRepo.delete(id),
        deleteMany: (ids: DatabaseId[]) =>
          revisionsRepo.deleteMany({ _id: { $in: ids } } as any, { permanent: true }),
        cleanup: contentMethods.cleanupRevisions.bind(contentMethods),
      },
    } as unknown as IContentAdapter;
  }

  /**
   * Initializes monitoring models and methods.
   */
  async ensureMonitoring(): Promise<void> {
    this.monitoring = {
      cache: {
        get: (key: string) =>
          cacheService.get(key).then((data) => ({ success: true, data: data as any })),
        set: (key: string, value: any, options?: any) =>
          cacheService
            .set(key, value, options?.ttl || 300, undefined, options?.category, options?.tags)
            .then(() => ({ success: true, data: undefined })),
        delete: (key: string) =>
          cacheService.delete(key).then(() => ({ success: true, data: undefined })),
        clear: (tags?: string[]) =>
          (tags ? cacheService.clearByTags(tags) : cacheService.invalidateAll()).then(() => ({
            success: true,
            data: undefined,
          })),
        invalidateCollection: (collection: string, tenantId?: DatabaseId | null) =>
          cacheService
            .clearByPattern(`collection:${collection}:*`, tenantId)
            .then(() => ({ success: true, data: undefined })),
        invalidateCategory: (category: string, tenantId?: DatabaseId | null) =>
          cacheService
            .clearByPattern(`*:${category}:*`, tenantId || "*")
            .then(() => ({ success: true, data: undefined })),
        getVersion: async (tenantId?: DatabaseId | null) => {
          const version = await cacheService.get(`system:content_version`, tenantId);
          return { success: true, data: (version as number) || 0 };
        },
        incrementVersion: async (tenantId?: DatabaseId | null) => {
          const key = `system:content_version`;
          const current = ((await cacheService.get(key, tenantId)) as number) || 0;
          const next = current + 1;
          await cacheService.set(key, next, 0, tenantId); // 0 = no TTL
          return { success: true, data: next };
        },
      },
      performance: {
        getMetrics: () => Promise.resolve({ success: true, data: {} as PerformanceMetrics }),
        clearMetrics: () => Promise.resolve({ success: true, data: undefined }),
        enableProfiling: () => Promise.resolve({ success: true, data: undefined }),
        getSlowQueries: () => Promise.resolve({ success: true, data: [] }),
      },
    } as IMonitoringAdapter;
  }

  utils = {
    generateId: () => generateId(),
    validateId: (id: string) => validateId(id),
    normalizePath: (p: string) => p,
    createPagination: <T>(items: T[]) => ({
      items: items,
      total: items.length,
    }),
  } as any;

  private _getOrCreateModel(name: string): mongoose.Model<any> {
    if (this._models.has(name)) return this._models.get(name)!;
    // CRITICAL: Use String for _id to support UUIDs and prevent Cast to ObjectId errors
    const schema = new mongoose.Schema({ _id: String }, { strict: false, timestamps: true });
    const model = mongoose.models[name] || mongoose.model(name, schema);
    this._models.set(name, model);
    return model;
  }
}
