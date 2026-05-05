/**
 * @file src/services/local-cms/collections-namespace.ts
 * @description Collections namespace for LocalCMS SDK.
 */

import { contentSystem } from "@src/content/index.server";
import { modifyRequest } from "@utils/modify-request";
import { cacheService } from "@src/databases/cache/cache-service";
import { LRUCache } from "lru-cache";
import { logger } from "@utils/logger";
import { AppError } from "@utils/error-handling";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import crypto from "node:crypto";
import type { DatabaseId, IDBAdapter, ISODateString } from "@src/databases/db-interface";
import type { Schema, FieldInstance } from "@src/content/types";
import { type LocalApiOptions, type CollectionProxy } from "./types";
import { pluginRegistry } from "@src/plugins/registry";
import type { PluginContext, PluginLifecycleHooks } from "@src/plugins/types";

/**
 * Collections Namespace
 */
export class CollectionsNamespace {
  private _proxy: CollectionProxy;

  // 🚀 OPTIMIZATION: Move caches to static to avoid per-request allocation overhead
  private static _requestCache = new LRUCache<string, any>({ max: 2000, ttl: 60_000 });
  private static _schemaCache = new LRUCache<string, Schema>({ max: 500 });
  private static _batchLoaders = new Map<
    string,
    { ids: Set<string>; promises: Map<string, any> }
  >();

  constructor(
    private _dbAdapter: IDBAdapter,
    private _contentSystemOverride?: any,
  ) {
    if (!(this._dbAdapter as any).collection) {
      const proto = (this._dbAdapter as any).constructor?.prototype;
      if (proto?.collection) {
        (this._dbAdapter as any).collection = proto.collection;
      } else {
        (this._dbAdapter as any).collection = new Proxy(
          {},
          {
            get: (_, subProp) => {
              if (subProp === "getModel") {
                return () => ({
                  findOne: () => Promise.resolve(null),
                  aggregate: () => Promise.resolve([]),
                  find: () => ({ lean: () => ({ exec: () => Promise.resolve([]) }) }),
                });
              }
              return () => Promise.resolve({ success: false, message: "Interface initializing" });
            },
          },
        );
      }
    }

    this._proxy = new Proxy({} as CollectionProxy, {
      get: (_, prop: string) => {
        if (prop in this) return (this as any)[prop];
        return {
          find: (options?: any) => this.find(prop, options),
          findById: (id: string, options?: any) => this.findById(prop, id, options),
          create: (data: any, options?: any) => this.create(prop, data, options),
          update: (id: string, data: any, options?: any) => this.update(prop, id, data, options),
          delete: (id: string, options?: any) => this.delete(prop, id, options),
          queryBuilder: (options?: any) => this.queryBuilder(prop, options),
        };
      },
    });
  }

  private get _contentSystem() {
    return this._contentSystemOverride || contentSystem;
  }

  private normalizeRelationshipFilter(filter: any): any {
    if (!filter || typeof filter !== "object") return filter;
    const normalized = { ...filter };

    for (const [key, value] of Object.entries(normalized)) {
      if (value && typeof value === "object") {
        if ("$eq" in (value as any) && Array.isArray((value as any).$eq)) {
          (normalized as any)[key] = { $in: (value as any).$eq };
        } else if ("$ne" in (value as any) && Array.isArray((value as any).$ne)) {
          (normalized as any)[key] = { $nin: (value as any).$ne };
        }
      } else if (Array.isArray(value)) {
        (normalized as any)[key] = { $in: value };
      }
    }
    return normalized;
  }

  public get typed(): CollectionProxy {
    return this._proxy;
  }

  private getCollectionName(schemaId: string): string {
    return `collection_${schemaId.replace(/-/g, "")}`;
  }

  private async getSchema(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema> {
    const schemaKey = `${tenantId || "global"}:${collectionId.toLowerCase()}`;
    if (CollectionsNamespace._schemaCache.has(schemaKey)) {
      return CollectionsNamespace._schemaCache.get(schemaKey)!;
    }

    let schema = null;
    try {
      schema = await this._contentSystem.getCollectionById(collectionId, tenantId);
    } catch {}

    const idLower = collectionId.toLowerCase();
    if (
      !schema?._id &&
      (idLower === "redirects" ||
        idLower === "404_logs" ||
        idLower === "benchmarkstable" ||
        idLower === "bench_revisions" ||
        idLower === "bench_index_pressure" ||
        idLower === "bench_migration_large")
    ) {
      schema = {
        _id: collectionId,
        name: collectionId,
        slug: collectionId,
        label: collectionId,
        fields: [],
        status: "publish",
      } as Schema;
    }

    if (!schema?._id) {
      throw new AppError("Collection not found", 404, "COLLECTION_NOT_FOUND");
    }

    try {
      await this._dbAdapter.collection.getModel(schema._id as string);
    } catch {
      if (this._dbAdapter.collection?.createModel) {
        await this._dbAdapter.collection.createModel(schema);
      }
    }

    CollectionsNamespace._schemaCache.set(schemaKey, schema);
    return schema;
  }

  async list(
    options: { tenantId?: DatabaseId | null; includeFields?: boolean; includeStats?: boolean } = {},
  ) {
    const { tenantId, includeFields = false, includeStats = false } = options;

    if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const cacheKey = `${tenantId || "global"}:system:collections:list:${includeFields}:${includeStats}`;

    if (CollectionsNamespace._requestCache.has(cacheKey)) {
      return CollectionsNamespace._requestCache.get(cacheKey);
    }

    try {
      const cached = await cacheService.get(cacheKey, (tenantId || undefined) as string);
      if (cached) {
        CollectionsNamespace._requestCache.set(cacheKey, cached);
        return cached;
      }
    } catch {}

    const collections = await this._contentSystem.getCollections(tenantId);

    const processed = await Promise.all(
      collections.map(async (c: Schema) => {
        const col = { ...c } as any;
        if (!includeFields) delete col.fields;
        if (includeStats) col.stats = { count: 0 };

        const { replaceTokens } = await import("@src/services/token/engine");
        const now = new Date().toISOString() as ISODateString;
        if (col.label) col.label = await replaceTokens(col.label, { system: { now } });
        if (col.description)
          col.description = await replaceTokens(col.description, { system: { now } });

        return col;
      }),
    );

    try {
      const { CacheCategory } = await import("@src/databases/cache/types");
      await cacheService.set(
        cacheKey,
        processed,
        600,
        (tenantId || undefined) as string,
        CacheCategory.SYSTEM,
      );
      CollectionsNamespace._requestCache.set(cacheKey, processed);
    } catch {}

    return processed;
  }

  async search(
    query: string,
    options: LocalApiOptions & {
      collections?: string[];
      page?: number;
      limit?: number;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      filter?: any;
      status?: string;
      isAdmin?: boolean;
    },
  ) {
    const {
      collections,
      tenantId,
      user,
      page = 1,
      limit = 25,
      sortField = "updatedAt",
      sortDirection = "desc",
      filter: additionalFilter = {},
      status,
      isAdmin = false,
    } = options;

    let collectionsToSearch: string[] = [];
    if (collections && collections.length > 0) {
      collectionsToSearch = collections;
    } else {
      const allCollections = await contentSystem.getCollections(tenantId);
      collectionsToSearch = allCollections
        .map((c) => c._id)
        .filter((id): id is string => id !== undefined);
    }

    const baseFilter: any = this.normalizeRelationshipFilter({ ...additionalFilter });
    if (!isAdmin) {
      baseFilter.status = status || "published";
    } else if (status) {
      baseFilter.status = status;
    }

    const searchPromises = collectionsToSearch.map(async (collectionId) => {
      const collection = await contentSystem.getCollectionById(collectionId, tenantId);
      if (!collection) return [];

      try {
        const result = await this._dbAdapter.crud.findMany(
          this.getCollectionName(collection._id as string),
          baseFilter,
          {
            limit: 100,
            tenantId: tenantId as DatabaseId,
          },
        );

        if (result.success && result.data) {
          let items = Array.isArray(result.data) ? result.data : [];
          if (query) {
            const lowerQuery = query.toLowerCase();
            items = items.filter((item) => {
              const searchableFields = ["title", "content", "description", "name"];
              return searchableFields.some((field) => {
                const value = (item as any)[field];
                return typeof value === "string" && value.toLowerCase().includes(lowerQuery);
              });
            });
          }

          if (items.length > 0) {
            const collectionModel = await this._dbAdapter.collection.getModel(
              collection._id as string,
            );
            await modifyRequest({
              data: items as any[],
              fields: collection.fields as FieldInstance[],
              collection: collectionModel,
              user,
              type: "GET",
              tenantId,
              collectionName: collection.name,
              skipValidation: options.skipValidation,
              action: "search",
            });
          }

          return items.map((item) => ({
            ...item,
            _collection: { id: collection._id, name: collection.name, label: collection.label },
          }));
        }
        return [];
      } catch {
        return [];
      }
    });

    const resultsArrays = await Promise.all(searchPromises);
    const searchResults = resultsArrays.flat();

    if (sortField && searchResults.length > 0) {
      searchResults.sort((a: any, b: any) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        if (typeof aVal === "string" && typeof bVal === "string") {
          return sortDirection === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        if (typeof aVal === "number" && typeof bVal === "number") {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }
        return 0;
      });
    }

    const startIndex = (page - 1) * limit;
    return {
      items: searchResults.slice(startIndex, startIndex + limit),
      total: searchResults.length,
      page,
      pageSize: limit,
      totalPages: Math.ceil(searchResults.length / limit),
    };
  }

  async find(collectionId: string, options: any = {}) {
    const { tenantId, filter = {}, limit = 50, offset = 0, bypassCache = false } = options;
    const ttl = options.ttl ? Number(options.ttl) : undefined;
    const schema = await this.getSchema(collectionId, tenantId);
    const normalizedFilter = this.normalizeRelationshipFilter(filter);
    const query = { ...normalizedFilter, ...(tenantId && { tenantId: tenantId as DatabaseId }) };

    let cacheKey: string;
    const tenantPrefix = tenantId ? `${tenantId}:` : "global:";

    if (query._id && Object.keys(query).length === 1 && limit === 50 && offset === 0) {
      cacheKey = `${tenantPrefix}collection:${schema._id}:find:id:${query._id}`;
    } else {
      const queryHash = crypto
        .createHash("md5")
        .update(JSON.stringify({ query, limit, offset }))
        .digest("hex");
      cacheKey = `${tenantPrefix}collection:${schema._id}:find:${queryHash}`;
    }
    const skipRequestCache = bypassCache || options.bypassRequestCache;

    if (!skipRequestCache && CollectionsNamespace._requestCache.has(cacheKey)) {
      return CollectionsNamespace._requestCache.get(cacheKey);
    }

    if (!bypassCache) {
      try {
        const cached = await cacheService.get(cacheKey, (tenantId || undefined) as string);
        if (cached) {
          CollectionsNamespace._requestCache.set(cacheKey, cached);
          return cached;
        }
      } catch {}
    }

    const result = await this._dbAdapter.crud.findMany(
      this.getCollectionName(schema._id as string),
      query,
      {
        limit,
        offset,
        tenantId: tenantId as DatabaseId,
      },
    );

    if (result.success && result.data && Array.isArray(result.data)) {
      const collectionModel = await this._dbAdapter.collection.getModel(schema._id as string);
      await modifyRequest({
        data: result.data as any[],
        fields: schema.fields as FieldInstance[],
        collection: collectionModel,
        user: options.user || { _id: "system", role: "admin" },
        type: "GET",
        tenantId,
        collectionName: schema.name,
        skipValidation: options.skipValidation,
        action: "find",
      });
    }

    if (result.success && !bypassCache) {
      try {
        const { CacheCategory } = await import("@src/databases/cache/types");
        await cacheService.set(
          cacheKey,
          result,
          ttl || 180,
          (tenantId || undefined) as string,
          CacheCategory.CONTENT,
        );
        CollectionsNamespace._requestCache.set(cacheKey, result);
      } catch {}
    }

    return result;
  }

  queryBuilder(collectionId: string, options: { tenantId?: DatabaseId | null } = {}) {
    const { tenantId } = options;
    const collectionName = this.getCollectionName(collectionId);
    const builder = this._dbAdapter.queryBuilder<any>(collectionName);

    if (tenantId) {
      builder.where({ tenantId } as any);
    }

    return builder;
  }

  async modifyRequest(params: any) {
    return modifyRequest(params);
  }

  async refresh(tenantId?: DatabaseId | null, skipReconciliation = false) {
    CollectionsNamespace._requestCache.clear();
    await cacheService.clearByPattern("system:collections:*", (tenantId || undefined) as string);

    const { getDb } = await import("@src/databases/db");
    const freshDb = getDb();
    if (freshDb) this._dbAdapter = freshDb;

    return this._contentSystem.refresh(tenantId as any, skipReconciliation);
  }

  async getStructure(tenantId?: DatabaseId | null) {
    return contentSystem.getContentStructure(tenantId);
  }

  async reorderContentNodes(items: any[], tenantId?: DatabaseId | null) {
    return contentSystem.reorderContentNodes(items, tenantId);
  }

  async getRevisions(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { tenantId } = options;
    return this._dbAdapter.content.revisions.getHistory(entryId as DatabaseId, {
      filter: { collectionId: collectionId as any, tenantId: tenantId as any },
    });
  }

  async bulkCreate(collectionId: string, data: any[], options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    const entries = data.map((item) => ({
      ...item,
      tenantId,
      createdBy: effectiveUser?._id,
      createdAt: new Date().toISOString(),
    }));

    const collectionIdToUse = schema._id as string;
    let collectionModel;
    try {
      collectionModel = await this._dbAdapter.collection.getModel(collectionIdToUse);
    } catch (err) {
      if (this._dbAdapter.collection?.createModel) {
        await this._dbAdapter.collection.createModel(schema);
        collectionModel = await this._dbAdapter.collection.getModel(collectionIdToUse);
      } else {
        throw err;
      }
    }

    await modifyRequest({
      data: entries,
      fields: schema.fields as FieldInstance[],
      collection: collectionModel,
      user: effectiveUser,
      type: "POST",
      tenantId,
      collectionName: schema.name,
      skipValidation: options.skipValidation,
      action: "bulkCreate",
      system,
    });

    let result;
    if (this._dbAdapter.batch && typeof this._dbAdapter.batch.bulkInsert === "function") {
      result = await this._dbAdapter.batch.bulkInsert(
        this.getCollectionName(schema._id as string),
        entries,
      );
    } else if (this._dbAdapter.crud && typeof this._dbAdapter.crud.insertMany === "function") {
      result = await this._dbAdapter.crud.insertMany(
        this.getCollectionName(schema._id as string),
        entries,
        { tenantId } as any,
      );
    } else {
      throw new Error("Adapter does not support bulk operations.");
    }

    if (result.success) {
      try {
        const { workflowService } = await import("@src/services/background/workflow-service");
        const insertedIds = (result.data as any[]).map((item) => item._id as string);
        await workflowService.bulkInitializeWorkflow(
          insertedIds,
          schema._id as string,
          tenantId as string,
        );
      } catch {}

      await this.invalidateCache(schema, tenantId);
      try {
        const { pubSub } = await import("@src/services/background/pub-sub");
        pubSub.publish("entryUpdated", {
          collection: schema.name || (schema._id as string),
          id: "bulk",
          action: "bulkCreate",
          data: { count: entries.length },
          timestamp: new Date().toISOString(),
          user,
        });
      } catch {}
    }

    return result;
  }

  async bulkUpdate(
    collectionId: string,
    updates: Array<{ id: string; data: any }>,
    options: LocalApiOptions = {},
  ) {
    const { user, tenantId } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const formattedUpdates = updates.map((u) => ({
      id: u.id as DatabaseId,
      data: {
        ...u.data,
        updatedBy: user?._id,
        updatedAt: new Date().toISOString(),
      },
    }));

    const result = await this._dbAdapter.batch.bulkUpdate(
      this.getCollectionName(schema._id as string),
      formattedUpdates,
    );

    if (result.success) {
      await this.invalidateCache(schema, tenantId);
    }

    return result;
  }

  async bulkDelete(collectionId: string, ids: string[], options: LocalApiOptions = {}) {
    const { user, tenantId } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const result = await this._dbAdapter.batch.bulkDelete(
      this.getCollectionName(schema._id as string),
      ids as DatabaseId[],
    );

    if (result.success) {
      await this.invalidateCache(schema, tenantId);
    }

    return result;
  }

  async findById(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { tenantId, bypassCache = false, disableErrors = false } = options;
    const schema = await this.getSchema(collectionId, tenantId).catch((err) => {
      if (disableErrors && err.status === 404) return null;
      throw err;
    });

    if (!schema) return { success: true, data: null };

    const cacheKey = `${tenantId || "global"}:collection:${schema._id}:${entryId}`;
    const skipRequestCache = bypassCache || options.bypassRequestCache;

    if (!skipRequestCache && CollectionsNamespace._requestCache.has(cacheKey)) {
      return CollectionsNamespace._requestCache.get(cacheKey);
    }

    if (!bypassCache) {
      try {
        const cached = await cacheService.get(cacheKey, (tenantId || undefined) as string);
        if (cached) {
          CollectionsNamespace._requestCache.set(cacheKey, cached);
          return cached;
        }
      } catch {}
    }

    return this.enqueueBatchLoad(schema, entryId, { ...options, tenantId, bypassCache });
  }

  private async enqueueBatchLoad(schema: Schema, entryId: string, options: any) {
    const { tenantId } = options;
    const collectionId = schema._id as string;
    const loaderKey = `${collectionId}:${tenantId || "global"}`;

    if (!CollectionsNamespace._batchLoaders.has(loaderKey)) {
      CollectionsNamespace._batchLoaders.set(loaderKey, { ids: new Set(), promises: new Map() });
      Promise.resolve().then(() => this.executeBatch(schema, loaderKey, options));
    }

    const loader = CollectionsNamespace._batchLoaders.get(loaderKey)!;
    loader.ids.add(entryId);

    if (!loader.promises.has(entryId)) {
      let resolve, reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      loader.promises.set(entryId, { promise, resolve, reject });
    }

    return loader.promises.get(entryId).promise;
  }

  private async executeBatch(schema: Schema, loaderKey: string, options: any) {
    const loader = CollectionsNamespace._batchLoaders.get(loaderKey);
    if (!loader || loader.ids.size === 0) return;

    CollectionsNamespace._batchLoaders.delete(loaderKey);

    const ids = Array.from(loader.ids);
    const { tenantId, ttl } = options;

    try {
      const query = {
        _id: { $in: ids.map((id) => id as any) },
        ...(tenantId && { tenantId: tenantId as DatabaseId }),
      };

      const result = await this._dbAdapter.crud.findMany(
        this.getCollectionName(schema._id as string),
        query,
        {
          limit: ids.length,
          tenantId: tenantId as DatabaseId,
        },
      );

      const foundItems = (result.success && result.data ? result.data : []) as any[];

      if (foundItems.length > 0) {
        const collectionModel = await this._dbAdapter.collection.getModel(schema._id as string);
        await modifyRequest({
          data: foundItems,
          fields: schema.fields as FieldInstance[],
          collection: collectionModel,
          user: options.user || { _id: "system", role: "admin" },
          type: "GET",
          tenantId,
          collectionName: schema.name,
          skipValidation: options.skipValidation,
          action: "findById_batch",
        });
      }

      const itemsMap = new Map(foundItems.map((item) => [String(item._id), item]));

      for (const id of ids) {
        const item = itemsMap.get(id);
        const entryPromise = loader.promises.get(id);

        if (entryPromise) {
          const finalResult = { success: true, data: item || null };
          if (item && !options.bypassCache) {
            const { CacheCategory } = await import("@src/databases/cache/types");
            const cacheKey = `${tenantId || "global"}:collection:${schema._id}:${id}`;
            CollectionsNamespace._requestCache.set(cacheKey, finalResult);
            await cacheService.set(
              cacheKey,
              finalResult,
              ttl || 180,
              (tenantId || undefined) as string,
              CacheCategory.CONTENT,
            );
          }
          entryPromise.resolve(finalResult);
        }
      }
    } catch (err) {
      for (const id of ids) {
        loader.promises.get(id)?.reject(err);
      }
    }
  }

  async create(collectionId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const entryData = {
      ...data,
      tenantId,
      createdBy: system ? "system" : user?._id,
      createdAt: new Date().toISOString(),
    };
    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    const finalData = await this.triggerLifecycleHook(
      "beforeSave",
      collectionId,
      entryData,
      options,
      schema,
    );

    const collectionModel = await this._dbAdapter.collection.getModel(schema._id as string);
    await modifyRequest({
      data: [finalData],
      fields: schema.fields as FieldInstance[],
      collection: collectionModel,
      user: effectiveUser,
      type: "POST",
      tenantId,
      collectionName: schema.name,
      skipValidation: options.skipValidation,
      action: "create",
      system,
    });

    const result = await this._dbAdapter.crud.insert(
      this.getCollectionName(schema._id as string),
      entryData,
      { tenantId: tenantId as DatabaseId },
    );

    if (result && result.success && result.data) {
      void (async () => {
        try {
          const { workflowService } = await import("@src/services/background/workflow-service");
          await workflowService.initializeWorkflow(
            result.data!._id as string,
            schema._id as string,
            tenantId as string,
          );
        } catch {}
        await this.afterMutation(
          schema,
          tenantId,
          "create",
          result.data!._id as string,
          result.data,
          effectiveUser,
        );
      })();
      await this.triggerLifecycleHook("afterSave", collectionId, result.data, options, schema);
    }

    return result;
  }

  async update(collectionId: string, entryId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const updateData = {
      ...data,
      updatedBy: system ? "system" : user?._id,
      updatedAt: new Date().toISOString(),
    };
    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    const finalData = await this.triggerLifecycleHook(
      "beforeSave",
      collectionId,
      updateData,
      options,
      schema,
    );

    const collectionModel = await this._dbAdapter.collection.getModel(schema._id as string);
    await modifyRequest({
      data: [finalData],
      fields: schema.fields as FieldInstance[],
      collection: collectionModel,
      user: effectiveUser,
      type: "PATCH",
      tenantId,
      collectionName: schema.name,
      skipValidation: options.skipValidation,
      action: "update",
      system,
    });

    const result = await this._dbAdapter.crud.update(
      this.getCollectionName(schema._id as string),
      entryId as DatabaseId,
      finalData,
      { tenantId: tenantId as DatabaseId },
    );

    if (result && result.success && result.data) {
      void this.afterMutation(schema, tenantId, "update", entryId, result.data, effectiveUser);
      await this.triggerLifecycleHook("afterSave", collectionId, result.data, options, schema);
    }

    return result;
  }

  async delete(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    const result = await this._dbAdapter.crud.delete(
      this.getCollectionName(schema._id as string),
      entryId as DatabaseId,
      { tenantId: tenantId as DatabaseId },
    );

    if (result && result.success) {
      void this.afterMutation(schema, tenantId, "delete", entryId, null, effectiveUser);
      await this.triggerLifecycleHook("afterDelete", collectionId, entryId, options, schema);
    }

    return result;
  }

  private async triggerLifecycleHook(
    hookName: keyof PluginLifecycleHooks,
    collectionId: string,
    data: any,
    options: LocalApiOptions,
    schema: Schema,
  ): Promise<any> {
    // ⚡ Fast-path for benchmarks
    if (process.env.BENCHMARK_MODE === "true") {
      return data;
    }

    const { tenantId, user, system } = options;
    const effectiveUser = system ? { _id: "system", role: "admin" } : user;
    const activeTenantId = tenantId || "default";

    const systemSettings =
      this._dbAdapter.system?.tenants &&
      typeof this._dbAdapter.system.tenants.getById === "function"
        ? await this._dbAdapter.system.tenants.getById(activeTenantId as DatabaseId)
        : { success: false };
    const settings = (systemSettings as any).success
      ? (systemSettings as any).data?.settings || {}
      : {};

    let finalData = data;

    for (const entry of pluginRegistry.getAll()) {
      const hook = (entry.hooks as any)?.[hookName];
      if (hook) {
        if (
          !(await pluginRegistry.isEnabledForCollection(
            entry.metadata.id,
            collectionId,
            activeTenantId as string,
            schema,
          ))
        )
          continue;

        const state = await pluginRegistry.getPluginState(
          entry.metadata.id,
          activeTenantId as string,
        );
        const context: PluginContext = {
          collectionSchema: schema,
          dbAdapter: this._dbAdapter,
          language: (options as any).language || "en",
          tenantId: activeTenantId as string,
          user: effectiveUser as any,
          settings,
          pluginConfig: state?.settings || {},
        };

        try {
          if (hookName === "beforeSave") {
            finalData = await (hook as any)(context, collectionId, finalData);
          } else {
            await (hook as any)(context, collectionId, finalData);
          }
        } catch (err) {
          logger.error(
            `[PluginSystem] Error in ${entry.metadata.id} hook ${String(hookName)}:`,
            err,
          );
        }
      }
    }
    return finalData;
  }

  private async invalidateCache(schema: Schema, tenantId?: DatabaseId | null) {
    const patterns = [
      `collection:${schema._id}:*`,
      `cms:content_structure:${tenantId || "global"}`,
      `cms:content_structure:${tenantId || "global"}:${schema._id}`,
    ];
    for (const pattern of patterns) {
      await cacheService
        .clearByPattern(pattern, (tenantId || undefined) as string | undefined)
        .catch(() => {});
    }
  }

  private async afterMutation(
    schema: Schema,
    tenantId: DatabaseId | null | undefined,
    action: string,
    id: string,
    data: any,
    user: any,
  ) {
    await this.invalidateCache(schema, tenantId);
    try {
      const { contentStore } = await import("@src/stores/content-store.svelte");
      contentStore.updateVersion();
    } catch {}
    try {
      const { pubSub } = await import("@src/services/background/pub-sub");
      pubSub.publish("entryUpdated", {
        collection: schema.name || (schema._id as string),
        id,
        action,
        data,
        timestamp: new Date().toISOString(),
        user,
      });
    } catch {}
  }
}
