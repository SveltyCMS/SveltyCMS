/**
 * @file src/services/sdk/namespaces/collections-namespace.ts
 * @description
 * Collections namespace for LocalCMS SDK.
 *
 * Thin orchestrator over the split modules under `./collections/`:
 * - lazy-services.ts  — memoized dynamic imports (workflow, response-cache,
 *   pub-sub, outbox, token engine, history service, db module)
 * - request-cache.ts  — L1 LRU + keyspace index
 * - schema-store.ts   — schema LRU, hot flags, benchmark fallbacks, model cache
 * - read-pipeline.ts  — filter normalization, tenant/publication query build,
 *   find cache keys, read-through cache
 * - write-pipeline.ts — field prep, schema hooks, write guard, widget pipeline
 * - post-write.ts     — L1/L2 invalidation, outbox batching, plugin hooks
 *
 * ### Features:
 * - multi-tenant isolation via tenantId injection on every DB query
 * - publication clamping with publication-aware cache-key suffixes
 * - L1/L2 read-through + single-flight coalescing (coalesceQuery)
 * - detached best-effort post-write side effects
 * - typed collection proxy (`typed`) for ergonomic access
 */

import { modifyStream, type EntryData } from "@utils/modify-request";
import { prepareCollectionFields } from "@src/content/content-utils";
import {
  applyPublicationToQuery,
  publicationCacheSuffix,
  resolvePublicationFilter,
} from "@utils/security/publication-policy";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";
import { AppError } from "@utils/error-handling";
import { isMultiTenantEnabled } from "@utils/tenant";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { contentSystem as serverContentSystem } from "@src/content/index.server";
import type { FieldInstance, Schema } from "@src/content/types";
import { type LocalApiOptions, type CollectionProxy } from "./types";
import { copyDataWithFreshRowIds } from "@src/utils/data/copy-data-with-fresh-ids";
import { resolvePopulatedRelations } from "./populate-resolver";
import { PROFILE_WRITE_ENABLED, profileSpan, profileMark } from "@utils/write-profiler";
import { decodePageCursor, mergeKeysetFilter } from "@src/databases/core/page-utils";
import { nowISODateString } from "@src/utils/date";
import { collectionTableName } from "@src/databases/core/collection-name";

import {
  getDbModuleLazy,
  getHistoryServiceLazy,
  getPubSubLazy,
  getTokenEngineLazy,
  getWorkflowServiceLazy,
} from "./collections/lazy-services";
import {
  evictRequestCache,
  getRequestCache,
  hasRequestCache,
  setRequestCache,
} from "./collections/request-cache";
import {
  clearSchemaCache,
  ensureSchemaHotFlags,
  getCachedSchema,
  getModelResilient,
  resolveSchema,
  schemaCacheEntries,
  schemaCacheKey,
  setCachedSchema,
} from "./collections/schema-store";
import {
  buildFindCacheKey,
  buildTenantQuery,
  normalizeRelationshipFilter,
  readThroughCache,
} from "./collections/read-pipeline";
import {
  applyWidgetPipeline,
  prepareWritePayload,
  type PrepFieldSchema,
} from "./collections/write-pipeline";
import {
  invalidateCache,
  persistWithOutbox,
  schedulePostWrite,
  shouldSkipWriteSideEffects,
  triggerLifecycleHook,
} from "./collections/post-write";

type ContentSystem = typeof serverContentSystem;

/** Searchable field names — hoisted so the per-item filter loop shares one array. */
const SEARCHABLE_FIELDS = ["title", "content", "description", "name"];

/** Status/schedule patches have no nested arrays — skip recursive row-id walks. */
function isShallowPatch(data: Record<string, unknown>): boolean {
  for (const value of Object.values(data)) {
    if (value !== null && typeof value === "object") return false;
  }
  return true;
}

function sameShallowPayload(updates: Array<{ data: Record<string, unknown> }>): boolean {
  if (updates.length <= 1) return true;
  const first = updates[0].data;
  const keys = Object.keys(first);
  for (let i = 1; i < updates.length; i++) {
    const next = updates[i].data;
    if (Object.keys(next).length !== keys.length) return false;
    for (const key of keys) {
      if (next[key] !== first[key]) return false;
    }
  }
  return true;
}

let resolvedContentSystem: ContentSystem | null = null;

async function getContentSystem(): Promise<ContentSystem> {
  if (!resolvedContentSystem) {
    const mod = await import("@src/content/index.server");
    resolvedContentSystem = mod.contentSystem;
  }
  return resolvedContentSystem;
}

/**
 * Collections Namespace
 */
export class CollectionsNamespace {
  private _proxy: CollectionProxy;

  constructor(
    private _dbAdapter: IDBAdapter,
    private _contentSystemOverride?: ContentSystem,
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
                  find: () => ({
                    lean: () => ({ exec: () => Promise.resolve([]) }),
                  }),
                });
              }
              return () =>
                Promise.resolve({
                  success: false,
                  message: "Interface initializing",
                });
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

  private get _contentSystem(): ContentSystem | null {
    return this._contentSystemOverride || resolvedContentSystem;
  }

  private async _resolveContentSystem(): Promise<ContentSystem> {
    return this._contentSystemOverride || getContentSystem();
  }

  public get typed(): CollectionProxy {
    return this._proxy;
  }

  /** Thin delegate to the shared request-cache module (kept for API stability). */
  public static setRequestCache(
    key: string,
    value: any,
    collectionId?: string,
    tenantId?: DatabaseId | null,
  ): void {
    setRequestCache(key, value, collectionId, tenantId);
  }

  /** Thin delegate to the shared request-cache module (kept for API stability). */
  public static evictRequestCache(collectionId?: string, tenantId?: string): void {
    evictRequestCache(collectionId, tenantId);
  }

  public getCollectionName(schemaId: string): string {
    return collectionTableName(schemaId);
  }

  /**
   * 🚀 HYDRATION: Manually register a schema in the local cache.
   * Useful for setup scripts and benchmarks.
   *
   * After caching, best-effort provisions the physical collection model/table
   * so a fresh DB (setup, ci-fresh benchmark sandbox) is ready to write
   * immediately. Provisioning failures are expected misses (no adapter
   * support, adapter still initializing, model already exists) and must never
   * break schema registration. Callers that don't await still work —
   * provisioning simply becomes fire-and-forget.
   */
  public async registerSchema(
    collectionId: string,
    schema: Schema,
    tenantId?: DatabaseId | null,
  ): Promise<void> {
    const schemaKey = schemaCacheKey(tenantId, collectionId);
    setCachedSchema(schemaKey, schema);
    CollectionsNamespace.evictRequestCache(collectionId, tenantId as string);
    logger.debug(`[Collections] Manually registered schema: ${schemaKey}`);

    try {
      await this._dbAdapter.collection?.createModel?.(schema);
    } catch (err) {
      logger.debug(
        `[Collections] Model provisioning skipped for ${schemaKey}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async getSchema(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema> {
    return resolveSchema(this._dbAdapter, collectionId, tenantId, () =>
      this._resolveContentSystem(),
    );
  }

  async list(
    options: {
      tenantId?: DatabaseId | null;
      includeFields?: boolean;
      includeStats?: boolean;
    } = {},
  ) {
    const { tenantId, includeFields = false, includeStats = false } = options;

    if (isMultiTenantEnabled() && !tenantId) {
      throw new AppError("Tenant ID required", 400, "TENANT_MISSING");
    }

    const cacheKey = `${tenantId || "global"}:system:collections:list:${includeFields}:${includeStats}`;

    if (hasRequestCache(cacheKey)) {
      return getRequestCache(cacheKey);
    }

    try {
      const syncCached = cacheService.getSync<any>(cacheKey, (tenantId || undefined) as string);
      if (syncCached) {
        CollectionsNamespace.setRequestCache(cacheKey, syncCached, undefined, tenantId);
        return syncCached;
      }
      const cached = await cacheService.get(cacheKey, (tenantId || undefined) as string);
      if (cached) {
        CollectionsNamespace.setRequestCache(cacheKey, cached, undefined, tenantId);
        return cached;
      }
    } catch {}

    const cs = await this._resolveContentSystem();
    const collections = await cs.getCollections(tenantId);

    // Merge in any manually registered schemas from cache
    const prefix = `${tenantId || "global"}:`;
    const cachedSchemas: Schema[] = [];
    for (const [key, schema] of schemaCacheEntries()) {
      if (key.startsWith(prefix)) {
        if (!collections.some((c: Schema) => c._id === schema._id)) {
          cachedSchemas.push(schema);
        }
      }
    }
    const allCollections = [...collections, ...cachedSchemas];

    // Token resolution hoisted out of the per-collection map loop; `now`
    // computed once for the whole batch (was per-iteration before).
    const { replaceTokens } = await getTokenEngineLazy();
    const now = nowISODateString();

    const processed = await Promise.all(
      allCollections.map(async (c: Schema) => {
        const col = { ...c } as any;
        if (!includeFields) delete col.fields;
        if (includeStats) col.stats = { count: 0 };

        if (col.label) col.label = await replaceTokens(col.label, { system: { now } });
        if (col.description)
          col.description = await replaceTokens(col.description, {
            system: { now },
          });

        return col;
      }),
    );

    try {
      await cacheService.set(
        cacheKey,
        processed,
        600,
        (tenantId || undefined) as string,
        CacheCategory.SYSTEM,
      );
      CollectionsNamespace.setRequestCache(cacheKey, processed, undefined, tenantId);
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

    const cs = await getContentSystem();
    const allCollections = await cs.getCollections(tenantId);
    const collectionMap = new Map<string, Schema>();
    for (const col of allCollections) {
      if (col._id) collectionMap.set(col._id, col);
    }

    let collectionsToSearch: string[] = [];
    if (collections && collections.length > 0) {
      collectionsToSearch = collections;
    } else {
      collectionsToSearch = allCollections
        .map((c) => c._id)
        .filter((id): id is string => id !== undefined);
    }

    const baseFilter: any = normalizeRelationshipFilter({
      ...additionalFilter,
    });

    const effectivePublicationFilter = resolvePublicationFilter(
      { user: options.user, system: options.system },
      status || (isAdmin ? "all" : "published"),
    );
    applyPublicationToQuery(baseFilter, effectivePublicationFilter);
    if (effectivePublicationFilter === "all" && status) {
      baseFilter.status = status;
    }

    const searchPromises = collectionsToSearch.map(async (collectionId) => {
      const collection =
        collectionMap.get(collectionId) || (await cs.getCollectionById(collectionId, tenantId));
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
              return SEARCHABLE_FIELDS.some((field) => {
                const value = (item as any)[field];
                return typeof value === "string" && value.toLowerCase().includes(lowerQuery);
              });
            });
          }

          if (items.length > 0) {
            await applyWidgetPipeline(collection as Schema, items as any[], {
              dbAdapter: this._dbAdapter,
              user,
              type: "GET",
              tenantId,
              collectionName: collection.name,
              skipValidation: options.skipValidation,
              action: "search",
            });

            // 🚀 Zero-Copy Projection: Mutate directly to avoid spread/allocation overhead
            for (let i = 0; i < items.length; i++) {
              (items[i] as any)._collection = {
                id: collection._id,
                name: collection.name,
                label: collection.label,
              };
            }
          }

          return items;
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
    const normalizedFilter = normalizeRelationshipFilter(filter);
    const decodedCursor = decodePageCursor(options.cursor);
    const baseQuery: any = decodedCursor
      ? mergeKeysetFilter(normalizedFilter as Record<string, unknown>, decodedCursor)
      : normalizedFilter;

    const { query, effectiveFilter: effectivePublicationFilter } = buildTenantQuery(
      baseQuery,
      tenantId,
      { user: options.user, system: options.system },
      options.publicationFilter,
    );

    const sort =
      options.sort ||
      (options.sortField
        ? ([[options.sortField, options.sortDirection || "desc"]] as [string, "asc" | "desc"][])
        : undefined);

    const skipRequestCache = bypassCache || options.bypassRequestCache;
    const cacheKey = buildFindCacheKey({
      schemaId: schema._id as string,
      tenantId,
      filter,
      query,
      limit,
      offset,
      sort,
      decodedCursor,
      effectiveFilter: effectivePublicationFilter,
      skipRequestCache,
      bypassCache,
      options,
    });

    if (cacheKey) {
      const cacheHit = await readThroughCache(cacheKey, tenantId, {
        skipRequestCache,
        bypassCache,
      });
      if (cacheHit.hit) {
        // Re-register with the collection id so list keys join the keyspace index.
        CollectionsNamespace.setRequestCache(
          cacheKey,
          cacheHit.payload,
          schema._id as string,
          tenantId,
        );
        return cacheHit.payload;
      }
    }

    const fetchFromDb = () =>
      this._dbAdapter.crud.findMany(this.getCollectionName(schema._id as string), query, {
        limit,
        offset,
        sort,
        fields: options.fields,
        populate: options.populate,
      });

    const result = cacheKey
      ? await cacheService.coalesceQuery(cacheKey, fetchFromDb)
      : await fetchFromDb();

    if (result.success && result.data) {
      const hot = ensureSchemaHotFlags(schema);
      if (hot._hasActiveWidgets) {
        await applyWidgetPipeline(schema, result.data as unknown as EntryData[], {
          dbAdapter: this._dbAdapter,
          user: options.user || { _id: "system", role: "admin" },
          type: "GET",
          tenantId,
          collectionName: schema.name,
          skipValidation: options.skipValidation,
          action: "find",
        });
      }

      if (Array.isArray(result.data)) {
        const collectionMeta = (schema as any)._collectionMeta || {
          id: schema._id,
          name: schema.name,
          label: schema.label,
        };
        (schema as any)._collectionMeta = collectionMeta;
        for (let i = 0; i < result.data.length; i++) {
          const item = result.data[i] as any;
          if (item) {
            item._collection = collectionMeta;
          }
        }
      }
    }

    if (options.populate && result.success && Array.isArray(result.data)) {
      await resolvePopulatedRelations(
        result.data,
        schema,
        options.populate,
        tenantId,
        this._dbAdapter,
        this.getCollectionName.bind(this),
      );
    }

    if (!bypassCache && cacheKey && result.success && result.data) {
      try {
        const cachePayload =
          options.populate && Array.isArray(result.data)
            ? structuredClone(result.data)
            : result.data;
        await cacheService.set(
          cacheKey,
          cachePayload,
          ttl || 180,
          (tenantId || undefined) as string,
          CacheCategory.CONTENT,
        );

        // Negative Caching: If result is empty and it was a specific ID query
        if (
          query._id &&
          (!result.data || (Array.isArray(result.data) && result.data.length === 0))
        ) {
          cacheService.recordMiss(cacheKey, (tenantId || undefined) as string);
        }

        CollectionsNamespace.setRequestCache(cacheKey, result, schema._id as string, tenantId);
      } catch {}
    }

    return result;
  }

  async findStreaming(
    collectionId: string,
    options: LocalApiOptions & {
      limit?: number;
      offset?: number;
      fields?: string[];
      sortField?: string;
      sortDirection?: "asc" | "desc";
      filter?: any;
      skipValidation?: boolean;
      publicationFilter?: "published" | "draft" | "all";
    } = {},
  ) {
    const { tenantId, user } = options;
    // Shared getSchema path — findStreaming previously bypassed the schema cache
    // via cs.getCollectionById, causing duplicate resolution per stream.
    const schema = await this.getSchema(collectionId, tenantId);

    const { query } = buildTenantQuery(
      normalizeRelationshipFilter({ ...options.filter }),
      tenantId,
      { user: options.user, system: options.system },
      options.publicationFilter,
    );
    const findOptions = {
      limit: options.limit,
      offset: options.offset,
      sort: options.sortField
        ? ([[options.sortField, options.sortDirection || "desc"]] as [string, "asc" | "desc"][])
        : undefined,
      fields: options.fields as any,
      tenantId: tenantId as DatabaseId,
    };

    const streamResult = await this._dbAdapter.crud.streamMany(
      this.getCollectionName(schema._id as string),
      query,
      findOptions,
    );

    if (!streamResult.success) throw new Error(streamResult.message);

    const collectionModel = await getModelResilient(this._dbAdapter, schema);

    return modifyStream(streamResult.data as any as AsyncIterable<EntryData>, {
      collection: collectionModel,
      fields: schema.fields as FieldInstance[],
      user: user || ({ _id: "system", role: "admin" } as any),
      type: "GET",
      tenantId: tenantId as string,
      collectionName: schema.name,
      skipValidation: options.skipValidation,
      action: "find",
    });
  }

  async count(
    collectionId: string,
    options: {
      tenantId?: DatabaseId | null;
      filter?: any;
      user?: any;
      system?: boolean;
      publicationFilter?: "published" | "draft" | "all";
    } = {},
  ) {
    const { tenantId, filter = {} } = options;
    const schema = await this.getSchema(collectionId, tenantId);
    const normalizedFilter = normalizeRelationshipFilter(filter);

    const { query } = buildTenantQuery(
      normalizedFilter,
      tenantId,
      { user: options.user, system: options.system },
      options.publicationFilter,
    );

    return this._dbAdapter.crud.count(this.getCollectionName(schema._id as string), query as any, {
      tenantId: tenantId as DatabaseId,
    });
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

  async refresh(tenantId?: DatabaseId | null, skipReconciliation = false) {
    CollectionsNamespace.evictRequestCache();
    clearSchemaCache();
    await cacheService.clearByPattern("system:collections:*", (tenantId || undefined) as string);

    const { getDb } = await getDbModuleLazy();
    const freshDb = getDb();
    if (freshDb) this._dbAdapter = freshDb;

    return this._contentSystem?.refresh(tenantId as any, skipReconciliation);
  }

  async getStructure(tenantId?: DatabaseId | null) {
    const cs = await getContentSystem();
    return cs.getContentStructure(tenantId);
  }

  async reorderContentNodes(items: any[], tenantId?: DatabaseId | null) {
    const cs = await getContentSystem();
    return cs.reorderContentNodes(items, tenantId);
  }

  async getRevisions(
    collectionId: string,
    entryId: string,
    options: LocalApiOptions & { limit?: number; page?: number } = {},
  ) {
    const { tenantId, limit, page } = options;
    const { HistoryService } = await getHistoryServiceLazy();
    return HistoryService.getRevisions({
      collectionId,
      entryId,
      tenantId: tenantId as string,
      dbAdapter: this._dbAdapter,
      limit: limit || 100,
      page: page || 1,
    });
  }

  async bulkCreate(collectionId: string, data: any[], options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);
    const hot = ensureSchemaHotFlags(schema);

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    const now = nowISODateString();
    const createdBy = effectiveUser?._id;

    const entries: EntryData[] = data.map((item) => {
      let doc = item;
      if (doc && typeof doc === "object") {
        if (hot._hasConstrainedFields) {
          doc = prepareCollectionFields(doc, schema as PrepFieldSchema, { constraints: true });
        }
        return {
          ...doc,
          tenantId,
          createdBy,
          createdAt: (doc as any).createdAt || now,
        } as EntryData;
      }
      return doc as EntryData;
    });

    if (hot._hasActiveWidgets) {
      await applyWidgetPipeline(schema, entries, {
        dbAdapter: this._dbAdapter,
        user: effectiveUser,
        type: "POST",
        tenantId,
        collectionName: schema.name,
        skipValidation: options.skipValidation,
        action: "bulkCreate",
        system,
      });
    }

    let result;
    if (this._dbAdapter.batch && typeof this._dbAdapter.batch.bulkInsert === "function") {
      result = await this._dbAdapter.batch.bulkInsert(
        this.getCollectionName(schema._id as string),
        entries as any[],
      );
    } else if (this._dbAdapter.crud && typeof this._dbAdapter.crud.insertMany === "function") {
      result = await this._dbAdapter.crud.insertMany(
        this.getCollectionName(schema._id as string),
        entries as any[],
        { tenantId } as any,
      );
    } else {
      throw new Error("Adapter does not support bulk operations.");
    }

    if (result.success && !shouldSkipWriteSideEffects(options)) {
      try {
        const workflowService = await getWorkflowServiceLazy();
        const insertedIds = Array.from({
          length: (result.data as any[]).length,
        }) as string[];
        const resultsData = result.data as any[];
        for (let i = 0; i < resultsData.length; i++) {
          insertedIds[i] = resultsData[i]._id as string;
        }
        await workflowService.bulkInitializeWorkflow(
          insertedIds,
          schema._id as string,
          tenantId as string,
        );
      } catch {}

      invalidateCache(schema, tenantId);
      try {
        const pubSub = await getPubSubLazy();
        pubSub.publish("entryUpdated", {
          collection: schema.name || (schema._id as string),
          id: "bulk",
          action: "bulkCreate",
          data: { count: entries.length },
          timestamp: nowISODateString(),
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
    const now = nowISODateString();

    const formattedUpdates = updates.map((u) => {
      const raw = (u.data ?? {}) as Record<string, unknown>;
      const patched = isShallowPatch(raw)
        ? raw
        : (copyDataWithFreshRowIds(raw) as Record<string, unknown>);
      return {
        id: u.id as DatabaseId,
        data: {
          ...patched,
          updatedBy: user?._id,
          updatedAt: now,
        },
      };
    });

    const table = this.getCollectionName(schema._id as string);
    let result;

    // Homogeneous payload (bulk publish/draft/archive) → one UPDATE WHERE _id IN (...)
    // instead of N per-row statements. Tenant is applied by crud.updateMany.
    if (formattedUpdates.length > 0 && sameShallowPayload(formattedUpdates)) {
      result = await this._dbAdapter.crud.updateMany(
        table,
        { _id: { $in: formattedUpdates.map((u) => u.id) } } as any,
        formattedUpdates[0].data as any,
        { tenantId: tenantId as DatabaseId },
      );
    } else {
      result = await this._dbAdapter.batch.bulkUpdate(table, formattedUpdates);
    }

    if (result.success && !shouldSkipWriteSideEffects(options)) {
      invalidateCache(schema, tenantId);
    }

    return result;
  }

  async bulkDelete(collectionId: string, ids: string[], options: LocalApiOptions = {}) {
    const { user, tenantId } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);
    if (schema?.disableBulkDelete) {
      throw new AppError(
        `Bulk delete is disabled for collection "${schema.name || collectionId}"`,
        403,
        "BULK_DELETE_DISABLED",
      );
    }

    // Single DELETE WHERE _id IN (...) with tenant isolation via mapQuery.
    // `permanent: true` matches previous batch.bulkDelete (hard delete, not isDeleted).
    const result = await this._dbAdapter.crud.deleteMany(
      this.getCollectionName(schema._id as string),
      { _id: { $in: ids as DatabaseId[] } } as any,
      { tenantId: tenantId as DatabaseId, userId: user?._id as DatabaseId, permanent: true },
    );

    if (result.success && !shouldSkipWriteSideEffects(options)) {
      invalidateCache(schema, tenantId);
    }

    return result;
  }

  /**
   * Raw id lookup — one `WHERE _id IN (...)` query, no widget modifyRequest.
   * Used by bulk clone so source rows are not processed twice.
   */
  async findByIds(collectionId: string, ids: string[], options: LocalApiOptions = {}) {
    if (!ids.length) return { success: true, data: [] };
    const { tenantId } = options;
    const schema = await this.getSchema(collectionId, tenantId);
    const result = await this._dbAdapter.crud.findByIds(
      this.getCollectionName(schema._id as string),
      ids as DatabaseId[],
      { tenantId: tenantId as DatabaseId, limit: ids.length },
    );
    // Normalize to the SDK envelope so callers can always read `.data`.
    return result?.success
      ? result
      : { success: false, data: [], message: (result as any)?.message };
  }

  async findById(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { tenantId, bypassCache = false, disableErrors = false } = options;
    // Canonical lowercase schema cache key — the legacy `${tenant}:${collectionId}`
    // (no lowercase) always missed getSchema's lowercased key, guaranteeing a
    // duplicate entry + wasted resolution on every findById.
    const schemaKey = schemaCacheKey(tenantId, collectionId);
    const schema =
      getCachedSchema(schemaKey) ||
      (await this.getSchema(collectionId, tenantId).catch((err) => {
        if (disableErrors && err.status === 404) return null;
        throw err;
      }));

    if (!schema) return { success: true, data: null };

    const effectivePublicationFilter = resolvePublicationFilter(
      { user: options.user, system: options.system },
      options.publicationFilter,
    );
    const cacheKey = `${tenantId || "global"}:collection:${schema._id}:${entryId}${publicationCacheSuffix(effectivePublicationFilter)}`;
    const skipRequestCache = bypassCache || options.bypassRequestCache;

    if (!skipRequestCache && hasRequestCache(cacheKey)) {
      return getRequestCache(cacheKey);
    }

    // 🚀 SYNC L1 HIT: Use synchronous L1 check instead of async L2 get.
    // For findByIdRandom (10K distinct IDs), the async cacheService.get() costs
    // ~5µs per miss just in microtask overhead — getSync eliminates that.
    if (!bypassCache) {
      const syncCached = cacheService.getSync?.<any>(cacheKey, (tenantId || undefined) as string);
      if (syncCached !== undefined && syncCached !== null) {
        CollectionsNamespace.setRequestCache(cacheKey, syncCached, schema._id as string, tenantId);
        return syncCached;
      }
    }

    // Single-id hot path: direct loadOneById (no microtask batch delay)
    return this.loadOneById(schema, entryId, {
      ...options,
      tenantId,
      bypassCache,
      effectivePublicationFilter,
    });
  }

  /**
   * Single-id hot path — findOne + optional widget pipeline (no microtask batch delay).
   */
  private async loadOneById(schema: Schema, entryId: string, options: any) {
    const { tenantId, ttl, bypassCache } = options;
    const collectionName = this.getCollectionName(schema._id as string);
    const effectivePublicationFilter =
      options.effectivePublicationFilter ||
      resolvePublicationFilter(
        { user: options.user, system: options.system },
        options.publicationFilter,
      );
    const { query } = buildTenantQuery(
      { _id: entryId as any },
      tenantId,
      { user: options.user, system: options.system },
      options.publicationFilter,
    );

    // 🚀 DIRECT DB CALL: Skip coalesceQuery wrapper for single-id lookups.
    // coalesceQuery creates a deferred promise + Map lookup even when nothing is
    // in-flight — for findByIdRandom (10K distinct IDs, near-zero collision rate)
    // this is pure overhead. Direct findOne is cheaper.
    // Status is bound in the query so unpublished rows never enter process memory
    // for clamped callers (and the empty result is cached under :published).
    const result = await this._dbAdapter.crud.findOne(collectionName, query, {
      tenantId: tenantId as DatabaseId,
    });

    let item =
      result.success && result.data
        ? Array.isArray(result.data)
          ? result.data[0]
          : result.data
        : null;

    if (item) {
      const hot = ensureSchemaHotFlags(schema);
      if (hot._hasActiveWidgets) {
        const payload = [{ ...item }];
        await applyWidgetPipeline(schema, payload, {
          dbAdapter: this._dbAdapter,
          user: options.user || { _id: "system", role: "admin" },
          type: "GET",
          tenantId,
          collectionName: schema.name,
          skipValidation: options.skipValidation,
          action: "findById",
        });
        item = payload[0] ?? item;
      }

      item._collection = (schema as any)._collectionMeta || {
        id: schema._id,
        name: schema.name,
        label: schema.label,
      };
      (schema as any)._collectionMeta = item._collection;
    }

    const finalResult = { success: true, data: item || null };
    const cacheKey = `${tenantId || "global"}:collection:${schema._id}:${entryId}${publicationCacheSuffix(effectivePublicationFilter)}`;

    if (!bypassCache) {
      // 🚀 FIRE-AND-FORGET L2: Don't await async cache write on the response path.
      // L1 set is synchronous; L2 set is microtasked.
      CollectionsNamespace.setRequestCache(cacheKey, finalResult, schema._id as string, tenantId);
      if (item) {
        cacheService
          .set(
            cacheKey,
            finalResult,
            ttl || 180,
            (tenantId || undefined) as string,
            CacheCategory.CONTENT,
          )
          .catch(() => {});
      } else {
        cacheService.recordMiss(cacheKey, (tenantId || undefined) as string);
      }
    }

    return finalResult;
  }

  async create(collectionId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = PROFILE_WRITE_ENABLED
      ? await profileSpan("ns:getSchema", () => this.getSchema(collectionId, tenantId))
      : await this.getSchema(collectionId, tenantId);
    const hot = ensureSchemaHotFlags(schema);

    // 🛡️ ACTIVE SANITIZATION + hooks + write guard in one shared pass
    const m1 = PROFILE_WRITE_ENABLED ? profileMark("ns:sanitize+validate") : null;
    let entryData = await prepareWritePayload(data, schema, hot, {
      user,
      system,
      operation: "create",
      tenantId,
    });

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    let finalData = await triggerLifecycleHook(
      this._dbAdapter,
      "beforeSave",
      collectionId,
      entryData,
      options,
      schema,
    );

    const m2 = PROFILE_WRITE_ENABLED ? profileMark("ns:widgets") : null;
    // Widget pipeline only when widgets declare modifyRequest
    if (hot._hasActiveWidgets) {
      const payload = [finalData];
      await applyWidgetPipeline(schema, payload, {
        dbAdapter: this._dbAdapter,
        user: effectiveUser,
        type: "POST",
        tenantId,
        collectionName: schema.name,
        skipValidation: options.skipValidation,
        action: "create",
        system,
      });
      finalData = payload[0] ?? finalData;
    }
    m2?.();

    const collectionName = this.getCollectionName(schema._id as string);
    const m3 = PROFILE_WRITE_ENABLED ? profileMark("ns:persist") : null;
    const result = await persistWithOutbox(
      "create",
      async (txOpts) =>
        this._dbAdapter.crud.insert(collectionName, finalData, {
          tenantId: tenantId as DatabaseId,
          ...txOpts,
        }),
      schema,
      tenantId,
      effectiveUser,
      (res) => String(res.data?._id ?? ""),
      (res) => res.data,
      { skipSideEffects: options.skipSideEffects },
    );
    m3?.();
    m1?.();

    if (result && result.success && result.data) {
      const createdId = result.data!._id as string;
      // ⚡ Response-path: never await side effects — concurrent create RPS depends on this
      schedulePostWrite(
        this._dbAdapter,
        "create",
        schema,
        collectionId,
        tenantId,
        createdId,
        result.data,
        effectiveUser,
        options,
      );
    }

    return result;
  }

  async update(collectionId: string, entryId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = PROFILE_WRITE_ENABLED
      ? await profileSpan("ns:getSchema", () => this.getSchema(collectionId, tenantId))
      : await this.getSchema(collectionId, tenantId);
    const hot = ensureSchemaHotFlags(schema);

    const m1u = PROFILE_WRITE_ENABLED ? profileMark("ns:sanitize+validate") : null;
    let updateData = await prepareWritePayload(data, schema, hot, {
      user,
      system,
      operation: "update",
      tenantId,
      entryId,
    });

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    let finalData = await triggerLifecycleHook(
      this._dbAdapter,
      "beforeSave",
      collectionId,
      updateData,
      options,
      schema,
    );

    const m2u = PROFILE_WRITE_ENABLED ? profileMark("ns:widgets") : null;
    if (hot._hasActiveWidgets) {
      const payload = [finalData];
      await applyWidgetPipeline(schema, payload, {
        dbAdapter: this._dbAdapter,
        user: effectiveUser,
        type: "PATCH",
        tenantId,
        collectionName: schema.name,
        skipValidation: options.skipValidation,
        action: "update",
        system,
      });
      finalData = payload[0] ?? finalData;
    }
    m2u?.();

    const m3u = PROFILE_WRITE_ENABLED ? profileMark("ns:persist") : null;
    const result = await persistWithOutbox(
      "update",
      async (txOpts) =>
        this._dbAdapter.crud.update(
          this.getCollectionName(schema._id as string),
          entryId as DatabaseId,
          finalData,
          { tenantId: tenantId as DatabaseId, ...txOpts },
        ),
      schema,
      tenantId,
      effectiveUser,
      () => entryId,
      (res) => res.data,
      { skipSideEffects: options.skipSideEffects },
    );
    m3u?.();
    m1u?.();

    if (result && result.success && result.data) {
      // ⚡ Response-path: never await side effects — concurrent update RPS depends on this
      schedulePostWrite(
        this._dbAdapter,
        "update",
        schema,
        collectionId,
        tenantId,
        entryId,
        result.data,
        effectiveUser,
        options,
      );
    }

    return result;
  }

  async delete(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.getSchema(collectionId, tenantId);

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    const result = await persistWithOutbox(
      "delete",
      async (txOpts) =>
        this._dbAdapter.crud.delete(
          this.getCollectionName(schema._id as string),
          entryId as DatabaseId,
          {
            tenantId: tenantId as DatabaseId,
            ...txOpts,
          },
        ),
      schema,
      tenantId,
      effectiveUser,
      () => entryId,
      () => null,
      { skipSideEffects: options.skipSideEffects },
    );

    if (result && result.success) {
      // ⚡ Response-path: never await side effects — concurrent delete RPS depends on this
      schedulePostWrite(
        this._dbAdapter,
        "delete",
        schema,
        collectionId,
        tenantId,
        entryId,
        null,
        effectiveUser,
        options,
      );
    }

    return result;
  }
}
