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
 * - write-pipeline.ts — field prep, schema hooks, write guard, widget pipeline,
 *                       AES-256-GCM encrypt:true at rest
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
import { runAfterOperation } from "@src/content/schema-hooks";
import {
  applyPublicationToQuery,
  isPublishedStatus,
  publicationCacheSuffix,
  resolvePublicationFilter,
} from "@utils/security/publication-policy";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";
import { AppError } from "@utils/error-handling";
import { isAdmin } from "@src/databases/auth/constants";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { contentSystem as serverContentSystem } from "@src/content/index.server";
import type { CollectionAction, FieldInstance, Schema } from "@src/content/types";
import { type LocalApiOptions, type CollectionProxy } from "./types";
import { copyDataWithFreshRowIds } from "@utils/data-utils";
import { resolvePopulatedRelations } from "./populate-resolver";
import { PROFILE_WRITE_ENABLED, profileSpan, profileMark } from "@utils/write-profiler";
import {
  decodePageCursor,
  defaultListSortOption,
  defaultPageSortOption,
  encodePageCursor,
  mergeKeysetFilter,
  resolvePageSort,
  withIdTiebreaker,
} from "@src/databases/core/page-utils";
import { parseIdLookup } from "@src/databases/core/lookup-query";
import { nowISODateString } from "@src/utils/date";
import { clampPageSize } from "@utils/api-params";
import { redactReadEnvelope, redactRecord } from "@utils/field-access";
import { buildCollectionCacheTags, collectionTableName } from "@src/databases/core/collection-name";
import { validateRequiredFields } from "@src/widgets/widget-validation";

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
  peekReadySchema,
  getModelResilient,
  resolveSchema,
  schemaCacheEntries,
  schemaCacheKey,
  setCachedSchema,
  widgetNamesOf,
  type SchemaHotFlags,
} from "./collections/schema-store";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import {
  assertEncryptedFieldsNotQueried,
  buildFindCacheKey,
  buildTenantQuery,
  decryptReadResult,
  decryptReadStream,
  normalizeRelationshipFilter,
  readThroughCache,
} from "./collections/read-pipeline";
import {
  applyWidgetPipeline,
  encryptWritePayload,
  prepareWritePayload,
  writeTouchesActiveWidgets,
  type PrepFieldSchema,
} from "./collections/write-pipeline";
import type { FieldEncryptionContext } from "@utils/security/field-encryption";
import {
  invalidateCache,
  persistWithOutbox,
  schedulePostWrite,
  shouldSkipWriteSideEffects,
  triggerLifecycleHook,
} from "./collections/post-write";
import { scheduleDefaultListWarm } from "./collections/list-warm";

/** Cached lazy handle to the content engine — one module-registry lookup instead of one per call. */
let contentModulePromise: Promise<typeof import("@src/content/index.server")> | undefined;
function loadContentModule(): Promise<typeof import("@src/content/index.server")> {
  return (contentModulePromise ??= import("@src/content/index.server"));
}

type ContentSystem = typeof serverContentSystem;

function isThenable<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof (value as { then?: unknown }).then === "function";
}

/** Admins and system callers keep every field. Everyone else is redacted. */
function readerMaySeeGuardedFields(
  user: { _id?: unknown; role?: unknown; isAdmin?: unknown } | null | undefined,
  system?: boolean,
): boolean {
  if (system) return true;
  if (!user) return false;
  return user._id === "system" || isAdmin(user);
}

/**
 * Decrypt, then drop fields the caller may not read. The cache keeps the full
 * row; this runs on the way out. Unguarded schemas and admins return the
 * decrypt result unchanged.
 */
/**
 * Row-ownership scope for a schema (`ownership: { field }`).
 *
 * Returns `false` when no restriction applies (no ownership declared, or an
 * admin/system caller), `null` when the caller cannot see any row (ownership is
 * declared but the caller has no user id — fail closed), and the extra WHERE
 * fragment otherwise. Merged into the list query before the cache key, so pages
 * and counts reflect exactly the rows the caller may read.
 */
export function ownershipFilter(
  schema: Schema,
  user: unknown,
  system?: boolean,
): Record<string, unknown> | null | false {
  const ownership = (schema as { ownership?: { field?: unknown } }).ownership;
  const field = ownership && typeof ownership === "object" ? ownership.field : undefined;
  if (typeof field !== "string" || !field) return false;
  if (system || isAdmin(user)) return false;
  const ownerId = (user as { _id?: unknown } | undefined | null)?._id;
  if (ownerId === undefined || ownerId === null || ownerId === "") return null;
  return { [field]: ownerId };
}

function ownerValue(row: unknown, field: string): unknown {
  if (!row || typeof row !== "object") return undefined;
  const value = (row as Record<string, unknown>)[field];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as { _id?: unknown })._id;
  }
  return value;
}

/**
 * Drop rows the caller does not own from a read envelope.
 *
 * Envelopes already served by an ownership-scoped query pass through untouched
 * (the fast paths return the same reference); a foreign row is removed on a
 * **copied** envelope, so a shared point-read cache entry is never mutated or
 * poisoned.
 */
export function stripUnownedRows(envelope: unknown, field: string, user: unknown): unknown {
  if (!envelope || typeof envelope !== "object") return envelope;
  const record = envelope as { data?: unknown };
  const ownerId = (user as { _id?: unknown } | undefined | null)?._id;
  const owns = (row: unknown): boolean => {
    if (ownerId === undefined || ownerId === null || ownerId === "") return false;
    const value = ownerValue(row, field);
    return value !== undefined && value !== null && String(value) === String(ownerId);
  };

  const data = record.data;
  if (Array.isArray(data)) {
    let firstForeign = -1;
    for (let i = 0; i < data.length; i++) {
      if (!owns(data[i])) {
        firstForeign = i;
        break;
      }
    }
    if (firstForeign === -1) return envelope;
    const kept: unknown[] = data.slice(0, firstForeign);
    for (let i = firstForeign + 1; i < data.length; i++) {
      if (owns(data[i])) kept.push(data[i]);
    }
    return { ...record, data: kept };
  }
  if (data === null || data === undefined || owns(data)) return envelope;
  return { ...record, data: null };
}

async function presentRead(
  result: unknown,
  schema: Schema,
  hot: SchemaHotFlags,
  encCtx: FieldEncryptionContext,
  user: LocalApiOptions["user"],
  system?: boolean,
): Promise<any> {
  const decoded = await decryptReadResult(result, hot, encCtx, { clone: true });
  const permitted =
    !hot._hasGuardedFields || readerMaySeeGuardedFields(user, system)
      ? decoded
      : redactReadEnvelope(decoded, schema.fields as FieldInstance[], user);
  // Row ownership: a non-owner never sees the row. The scoped list/count/stream
  // queries already exclude foreign rows; this guards point reads (and every lane
  // that reads through a shared cache) by dropping, never mutating, the envelope.
  const ownership = (schema as { ownership?: { field?: unknown } }).ownership;
  const ownerField = ownership && typeof ownership === "object" ? ownership.field : undefined;
  if (typeof ownerField !== "string" || !ownerField || system || isAdmin(user)) return permitted;
  return stripUnownedRows(permitted, ownerField, user);
}

function fieldEncryptionContext(
  schema: Schema,
  tenantId: DatabaseId | null | undefined,
): FieldEncryptionContext {
  return {
    collectionId: String(schema._id ?? schema.name ?? ""),
    tenantId: tenantId != null && String(tenantId).length > 0 ? String(tenantId) : "global",
  };
}

/**
 * Per-request phase marks (write lane, `SVELTY_SRV_SPLIT=1`). Zero cost when
 * the caller passes no `__phaseMarks` map — the `performance.now()` call sites
 * are skipped entirely, and the set is a single Map write per phase.
 */
function markWritePhase(options: LocalApiOptions, label: string, t0: number): void {
  const marks = options.__phaseMarks;
  if (marks) marks.set(label, performance.now() - t0);
}

/** Cheap start timestamp for a write phase — 0 when no marks map is present. */
function writePhaseT0(options: LocalApiOptions): number {
  return options.__phaseMarks ? performance.now() : 0;
}

/**
 * Encryption context for the read path.
 *
 * `decryptReadResult` ignores its context entirely unless the schema declares
 * `encrypt: true` fields, so an unencrypted schema — the common case on a hot read
 * lane — should not allocate a context object per call.
 */
function readEncryptionContext(
  schema: Schema,
  tenantId: DatabaseId | null | undefined,
  hot: { _hasEncryptedFields?: boolean },
): FieldEncryptionContext {
  return hot._hasEncryptedFields ? fieldEncryptionContext(schema, tenantId) : NO_ENCRYPTION_CONTEXT;
}

/** Shared placeholder — never read, because the context is only used when fields encrypt. */
const NO_ENCRYPTION_CONTEXT: FieldEncryptionContext = Object.freeze({
  collectionId: "",
  tenantId: "",
});

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
    const mod = await loadContentModule();
    resolvedContentSystem = mod.contentSystem;
  }
  return resolvedContentSystem;
}

/**
 * Collections Namespace
 */
/**
 * Fire-and-forget post-commit `afterOperation` hooks — never awaited, failures
 * are logged at debug and do not undo the write (mirrors `schedulePostWrite`).
 */
function scheduleAfterOperation(
  schema: Schema,
  hot: SchemaHotFlags,
  data: unknown,
  operation: "create" | "update",
  user: unknown,
  tenantId: DatabaseId | null | undefined,
): void {
  if (!hot._hasAfterOperationHooks) return;
  const document = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  void runAfterOperation(schema.hooks, schema.fields, document, {
    schema,
    operation,
    tenantId: tenantId ?? undefined,
    userId: (user as { _id?: string } | undefined | null)?._id,
  }).catch((err) => {
    logger.debug(
      `[collections] afterOperation hook failed (${operation}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}

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

  /** Warm schemas skip the async getSchema microtask and the ensureWidgets async hop
   * when hot-flags are already stamped (common on every request after first access).
   */
  private async schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema> {
    const peeked = peekReadySchema(tenantId, collectionId);
    // Only a flagged schema may skip ensureWidgets: ensureSchemaHotFlags refuses to
    // freeze flags while a named factory is still a pending chunk (it would record
    // "no modifyRequest" for a widget it has not loaded yet), and the callers that
    // read the flags right after this call do not re-check the undefined state the
    // way create/update/findById do. So the warm-and-stamped schema (>95% of
    // production requests) skips the microtask, the warm-but-unstamped one warms the
    // registry first — same guarantee the pre-existing peek + ensureWidgets had.
    if (peeked && peeked._hasActiveWidgets !== undefined) return peeked;
    const schema = peeked ?? (await this.getSchema(collectionId, tenantId));
    await widgetRegistryService.ensureWidgets(widgetNamesOf(schema));
    return schema;
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
        collectionMap.get(collectionId) || (await cs.getCollection(collectionId, tenantId));
      if (!collection) return [];

      try {
        assertEncryptedFieldsNotQueried(baseFilter, ensureSchemaHotFlags(collection));
        const result = await this._dbAdapter.crud.findMany(
          this.getCollectionName(collection._id as string),
          baseFilter,
          {
            limit: 100,
            tenantId: tenantId as DatabaseId,
          },
        );

        if (result.success && result.data) {
          const hot = ensureSchemaHotFlags(collection);
          const decrypted = (await presentRead(
            { success: true, data: result.data },
            collection,
            hot,
            fieldEncryptionContext(collection, tenantId),
            user,
            options.system,
          )) as { data?: unknown };
          let items = Array.isArray(decrypted.data) ? decrypted.data : [];
          if (query) {
            const lowerQuery = query.toLowerCase();
            items = items.filter((item: Record<string, unknown>) => {
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
    const {
      tenantId,
      filter = {},
      limit: requestedLimit = 50,
      offset = 0,
      bypassCache = false,
    } = options;
    // Hard ceiling on the SDK funnel both REST and GraphQL reads go through — a
    // client-supplied limit can never reach `crud.findMany` unbounded.
    const limit = clampPageSize(requestedLimit, 50);
    const ttl = options.ttl ? Number(options.ttl) : undefined;
    const schema = await this.schemaOf(collectionId, tenantId);
    const normalizedFilter = normalizeRelationshipFilter(filter);
    const ownership = ownershipFilter(schema, options.user, options.system);
    // Ownership declared but the caller has no user id: fail closed, never fall
    // back to an unscoped list.
    if (ownership === null) return { success: true, data: [] };
    const decodedCursor = decodePageCursor(options.cursor);
    // A supplied cursor that fails to decode must fail the request, not
    // silently fall back to an offset page (which would return duplicates).
    if (options.cursor && !decodedCursor) {
      throw new AppError("Invalid keyset cursor", 400);
    }
    // Keyset mode: cursor-driven deep pagination, opted into by `keyset: true`
    // (first page) or by carrying a cursor (continuation pages). Cursor pages
    // bypass the L1/L2 query cache (every page is a unique key with meta the
    // cache would drop) and fetch limit+1 so `hasMore` + `nextCursor` come
    // from the rows actually returned — the REST exposure of W2 (deep-offset
    // cliff). Without the opt-in, responses stay byte-identical to before.
    const keysetMode = decodedCursor !== null || options.keyset === true;
    const baseQuery: any = decodedCursor
      ? mergeKeysetFilter(normalizedFilter as Record<string, unknown>, decodedCursor)
      : normalizedFilter;
    // Ownership wins over a caller-supplied field of the same name.
    const scopedQuery = ownership ? { ...baseQuery, ...ownership } : baseQuery;

    const { query, effectiveFilter: effectivePublicationFilter } = buildTenantQuery(
      scopedQuery,
      tenantId,
      { user: options.user, system: options.system },
      options.publicationFilter,
    );

    const hot = ensureSchemaHotFlags(schema);
    const encCtx = fieldEncryptionContext(schema, tenantId);
    assertEncryptedFieldsNotQueried(
      query,
      hot,
      options.sortField || (Array.isArray(options.sort) ? options.sort?.[0]?.[0] : undefined),
    );

    // Id lookup (optional tenant + scalar status from publication clamp):
    // one findOne on the adapter ultra path, `{ data: T[] }` envelope.
    if (!decodedCursor && !offset && !options.fields && !options.populate) {
      const lookup = parseIdLookup(query);
      if (lookup) {
        const one = await this._dbAdapter.crud.findOne(
          this.getCollectionName(schema._id as string),
          query,
          { tenantId: tenantId as DatabaseId },
        );
        const row =
          one?.success && one.data ? (Array.isArray(one.data) ? one.data[0] : one.data) : null;
        if (row) {
          if (hot._hasActiveWidgets) {
            const payload = [row];
            await applyWidgetPipeline(schema, payload, {
              dbAdapter: this._dbAdapter,
              user: options.user || { _id: "system", role: "admin" },
              type: "GET",
              tenantId,
              collectionName: schema.name,
              skipValidation: options.skipValidation,
              action: "find",
            });
          }
          const collectionMeta = (schema as any)._collectionMeta || {
            id: schema._id,
            name: schema.name,
            label: schema.label,
          };
          (schema as any)._collectionMeta = collectionMeta;
          (row as any)._collection = collectionMeta;
        }
        const envelope = { success: true, data: row ? [row] : [] };
        return presentRead(envelope, schema, hot, encCtx, options.user, options.system);
      }
    }

    const sort =
      options.sort ||
      (options.sortField
        ? ([[options.sortField, options.sortDirection || "desc"]] as [string, "asc" | "desc"][])
        : undefined);

    // Keyset mode: the cursor is self-describing, so a walk without an explicit
    // sort continues in the cursor's own field/direction; the `_id` tiebreaker
    // is appended so the emitted ORDER BY matches the compound (field, _id)
    // cursor filter — without it, rows sharing the sort value order arbitrarily
    // and the `(field = v AND _id …)` branch skips or repeats them. The first
    // keyset page without a sort falls back to the findPage default (updatedAt
    // desc) so the walk's order is defined once and never drifts.
    const sortForDb = keysetMode
      ? withIdTiebreaker(
          sort ??
            (decodedCursor
              ? decodedCursor.f
                ? { [decodedCursor.f]: decodedCursor.d === "asc" ? 1 : -1 }
                : { _id: decodedCursor.d === "asc" ? 1 : -1 }
              : defaultPageSortOption()),
        )
      : // Deterministic default order (2026-09-28): an unsorted list read must have a
        // defined row order — without one the engine picks the access path, and the
        // LIMIT/OFFSET window can differ between two plans of the same query (SDK path
        // vs the Direct-to-Wire list statement), which also makes OFFSET pagination
        // non-deterministic. `_id` asc is unique and always indexed; the wire plane
        // compiles the same ORDER BY, which is what makes byte parity provable.
        (sort ?? defaultListSortOption());

    const skipRequestCache = bypassCache || options.bypassRequestCache;
    const cacheKey = keysetMode
      ? null
      : buildFindCacheKey({
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
        return presentRead(cacheHit.payload, schema, hot, encCtx, options.user, options.system);
      }
    }

    const fetchFromDb = () =>
      this._dbAdapter.crud.findMany(this.getCollectionName(schema._id as string), query, {
        limit: keysetMode ? limit + 1 : limit,
        offset: keysetMode ? 0 : offset,
        sort: sortForDb,
        fields: options.fields,
        populate: options.populate,
      });

    const result = cacheKey
      ? await cacheService.coalesceQuery(cacheKey, fetchFromDb)
      : await fetchFromDb();

    // Keyset continuation: slice the probe row and derive the next cursor from
    // the last returned row. The cursor's own field/direction are authoritative
    // when the caller repeats them (self-describing cursor), so a walk never
    // drifts from the ORDER BY its pages were built with.
    if (keysetMode && result.success && Array.isArray(result.data)) {
      const hasMore = result.data.length > limit;
      if (hasMore) result.data = result.data.slice(0, limit);
      const cursorSort = resolvePageSort(sortForDb);
      const last = hasMore ? (result.data[result.data.length - 1] as any) : null;
      if (hasMore && last && last._id !== undefined && last._id !== null) {
        const payload: Parameters<typeof encodePageCursor>[0] = {
          id: String(last._id),
          d: cursorSort.direction,
        };
        if (cursorSort.field !== "_id") {
          payload.f = cursorSort.field;
          payload.v = (last[cursorSort.field] as string | number | boolean | null) ?? null;
        }
        (result as { meta?: Record<string, unknown> }).meta = {
          hasMore: true,
          nextCursor: encodePageCursor(payload),
        };
      } else {
        (result as { meta?: Record<string, unknown> }).meta = { hasMore: false };
      }
    }

    if (result.success && result.data) {
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
        const cachePayload = result.data;
        await cacheService.set(
          cacheKey,
          cachePayload,
          ttl || 180,
          (tenantId || undefined) as string,
          CacheCategory.CONTENT,
          // 🚀 List/query caches are collection-wide: any write to the collection
          // must clear them. Tagged so clearByTags is O(#list-keys), not O(#docs).
          // Superset (as-passed + physical + bare spellings) so a physical-only
          // invalidator (Mongo crud → BaseAdapter.invalidateQueryCache) reaches
          // logical-spelled entries too.
          buildCollectionCacheTags(schema._id as string),
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

    return presentRead(result, schema, hot, encCtx, options.user, options.system);
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
    // via cs.getCollection, causing duplicate resolution per stream.
    const schema = await this.schemaOf(collectionId, tenantId);
    const hot = ensureSchemaHotFlags(schema);
    const encCtx = fieldEncryptionContext(schema, tenantId);
    // 🚀 Avoid the `{ ...options.filter }` spread allocation when filter is empty or
    // already a plain object with no relational operators — normalizeRelationshipFilter
    // only clones when an operator rewrite is needed (lazy-clone internally).
    const normalizedStreamFilter = normalizeRelationshipFilter(options.filter ?? {});
    assertEncryptedFieldsNotQueried(normalizedStreamFilter, hot, options.sortField);

    const ownership = ownershipFilter(schema, user, options.system);
    if (ownership === null) return (async function* emptyStream() {})();
    const scopedStreamFilter = ownership
      ? { ...normalizedStreamFilter, ...ownership }
      : normalizedStreamFilter;

    const { query } = buildTenantQuery(
      scopedStreamFilter,
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

    const stream = modifyStream(streamResult.data as unknown as AsyncIterable<EntryData>, {
      collection: collectionModel,
      fields: schema.fields as FieldInstance[],
      user: user || ({ _id: "system", role: "admin" } as any),
      type: "GET",
      tenantId: tenantId as string,
      collectionName: schema.name,
      skipValidation: options.skipValidation,
      action: "find",
    });
    if (!hot._hasGuardedFields || readerMaySeeGuardedFields(user, options.system)) {
      return decryptReadStream(stream, hot, encCtx);
    }
    const fields = schema.fields as FieldInstance[];
    async function* redacted(): AsyncIterable<unknown> {
      for await (const doc of decryptReadStream(stream, hot, encCtx)) {
        yield redactRecord(doc, fields, user);
      }
    }
    return redacted();
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
    const schema = await this.schemaOf(collectionId, tenantId);
    const normalizedFilter = normalizeRelationshipFilter(filter);
    assertEncryptedFieldsNotQueried(normalizedFilter, ensureSchemaHotFlags(schema));

    const ownership = ownershipFilter(schema, options.user, options.system);
    if (ownership === null) return { success: true, data: 0 };
    const scopedFilter = ownership ? { ...normalizedFilter, ...ownership } : normalizedFilter;

    const { query } = buildTenantQuery(
      scopedFilter,
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
    const schema = await this.schemaOf(collectionId, tenantId);
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

    if (hot._hasEncryptedFields) {
      const encCtx = fieldEncryptionContext(schema, tenantId);
      for (let i = 0; i < entries.length; i++) {
        await encryptWritePayload(entries[i], hot, encCtx);
      }
    }

    let result;
    const bulkOptions = { tenantId, ...(options as any) };
    if (this._dbAdapter.batch && typeof this._dbAdapter.batch.bulkInsert === "function") {
      result = await this._dbAdapter.batch.bulkInsert(
        this.getCollectionName(schema._id as string),
        entries as any[],
        bulkOptions,
      );
    } else if (this._dbAdapter.crud && typeof this._dbAdapter.crud.insertMany === "function") {
      result = await this._dbAdapter.crud.insertMany(
        this.getCollectionName(schema._id as string),
        entries as any[],
        bulkOptions,
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
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.schemaOf(collectionId, tenantId);
    const hot = ensureSchemaHotFlags(schema);

    if (
      !system &&
      !user?.isAdmin &&
      (hot._hasGuardedFields ?? true) &&
      schema.fields &&
      schema.fields.length > 0
    ) {
      const { assertWriteAllowed } =
        await import("@src/services/security/field-permission-service");
      for (const u of updates) {
        await assertWriteAllowed(
          schema.fields as FieldInstance[],
          (u.data ?? {}) as Record<string, unknown>,
          user,
          {
            collectionName: schema.name,
            entryId: u.id,
            tenantId: tenantId ?? undefined,
          },
        );
      }
    }

    const now = nowISODateString();
    const encCtx = fieldEncryptionContext(schema, tenantId);

    const formattedUpdates = [];
    for (const u of updates) {
      const raw = (u.data ?? {}) as Record<string, unknown>;
      const patched = isShallowPatch(raw)
        ? raw
        : (copyDataWithFreshRowIds(raw) as Record<string, unknown>);
      const data = {
        ...patched,
        updatedBy: user?._id,
        updatedAt: now,
      };
      await encryptWritePayload(data, hot, encCtx);
      formattedUpdates.push({
        id: u.id as DatabaseId,
        data,
      });
    }

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
      result = await this._dbAdapter.batch.bulkUpdate(table, formattedUpdates, {
        tenantId: tenantId as DatabaseId,
      });
    }

    if (result.success && !shouldSkipWriteSideEffects(options)) {
      invalidateCache(schema, tenantId, {
        writtenIds: formattedUpdates.map((u) => String(u.id)),
      });
    }

    return result;
  }

  async bulkDelete(collectionId: string, ids: string[], options: LocalApiOptions = {}) {
    const { user, tenantId } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.schemaOf(collectionId, tenantId);
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
      invalidateCache(schema, tenantId, { writtenIds: ids });
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
    const schema = await this.schemaOf(collectionId, tenantId);
    const result = await this._dbAdapter.crud.findByIds(
      this.getCollectionName(schema._id as string),
      ids as DatabaseId[],
      { tenantId: tenantId as DatabaseId, limit: ids.length },
    );
    // Normalize to the SDK envelope so callers can always read `.data`.
    const envelope = result?.success
      ? result
      : { success: false, data: [], message: (result as any)?.message };
    const hot = ensureSchemaHotFlags(schema);
    return presentRead(
      envelope,
      schema,
      hot,
      fieldEncryptionContext(schema, tenantId),
      options.user,
      options.system,
    );
  }

  async findById(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { tenantId, bypassCache = false, disableErrors = false } = options;
    // Canonical lowercase schema cache key — the legacy `${tenant}:${collectionId}`
    // (no lowercase) always missed getSchema's lowercased key, guaranteeing a
    // duplicate entry + wasted resolution on every findById.
    const schema =
      peekReadySchema(tenantId, collectionId) ||
      (await this.getSchema(collectionId, tenantId).catch((err) => {
        if (disableErrors && err.status === 404) return null;
        throw err;
      }));

    if (!schema) return { success: true, data: null };

    // Freeze hot flags once. Until the named factories are loaded, the scan
    // refuses to cache its result and would repeat on every random id.
    if ((schema as { _hasActiveWidgets?: boolean })._hasActiveWidgets === undefined) {
      await widgetRegistryService.ensureWidgets(widgetNamesOf(schema));
      ensureSchemaHotFlags(schema);
    }

    const effectivePublicationFilter = resolvePublicationFilter(
      { user: options.user, system: options.system },
      options.publicationFilter,
    );
    const cacheKey = `${tenantId || "global"}:collection:${schema._id}:${entryId}${publicationCacheSuffix(effectivePublicationFilter)}`;
    const skipRequestCache = bypassCache || options.bypassRequestCache;

    // The request cache for this key is only ever populated by a caller that did NOT
    // pass `skipCacheService` (see `loadOneById`), so probing it on behalf of such a
    // caller is dead work on the cold point-read path.
    if (!skipRequestCache && !options.skipCacheService && hasRequestCache(cacheKey)) {
      const hot = ensureSchemaHotFlags(schema);
      return presentRead(
        getRequestCache(cacheKey),
        schema,
        hot,
        readEncryptionContext(schema, tenantId, hot),
        options.user,
        options.system,
      );
    }

    // 🚀 SYNC L1 HIT: Use synchronous L1 check instead of async L2 get.
    // For findByIdRandom (10K distinct IDs), the async cacheService.get() costs
    // ~5µs per miss just in microtask overhead — getSync eliminates that.
    // Callers that opted out of the shared cache (skipCacheService — the HTTP
    // read lane) never wrote this key, so the probe is a guaranteed miss.
    if (!bypassCache && !options.skipCacheService) {
      const syncCached = cacheService.getSync?.<any>(cacheKey, (tenantId || undefined) as string);
      if (syncCached !== undefined && syncCached !== null) {
        CollectionsNamespace.setRequestCache(cacheKey, syncCached, schema._id as string, tenantId);
        const hot = ensureSchemaHotFlags(schema);
        return presentRead(
          syncCached,
          schema,
          hot,
          readEncryptionContext(schema, tenantId, hot),
          options.user,
          options.system,
        );
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
    // 🚀 DIRECT DB CALL: Direct findById bypasses findOne -> parseIdLookup overhead.
    // Publication clamping is applied to the retrieved item so unpublished rows never
    // escape to clamped callers (and empty result is cached under the publication suffix).
    const crud = this._dbAdapter.crud as any;
    const result =
      typeof crud.findById === "function"
        ? await crud.findById(collectionName, entryId as DatabaseId, {
            tenantId: tenantId as DatabaseId,
            skipMeta: true,
          })
        : await crud.findOne(collectionName, { _id: entryId } as any, {
            tenantId: tenantId as DatabaseId,
            skipMeta: true,
          });

    let item =
      result.success && result.data
        ? Array.isArray(result.data)
          ? result.data[0]
          : result.data
        : null;

    // Publication clamp: a clamped caller may only see published rows. The stored
    // status is `publish` while this filter is named `published`, so both must be
    // compared through the shared predicate — comparing the strings directly
    // denied every row. Rows without a status are not status-versioned and keep
    // passing through (unchanged behaviour).
    if (item && effectivePublicationFilter !== "all") {
      const status = (item as { status?: unknown }).status;
      if (typeof status === "string") {
        const allowed =
          effectivePublicationFilter === "published"
            ? isPublishedStatus(status)
            : status === "draft" || status === "unpublish";
        if (!allowed) item = null;
      }
    }

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

    if (!bypassCache && !options.skipCacheService) {
      // The HTTP lane already stores the response body. A second copy of every
      // random id in this LRU is insert+evict work the next GET never reads:
      // the lane returns from the response cache before findById runs again.
      CollectionsNamespace.setRequestCache(cacheKey, finalResult, schema._id as string, tenantId);
      if (item) {
        // Point-read lanes that already cache the full HTTP response opt out of
        // the second entry: cacheService.set also writes the key prefix map, the
        // doc tag index and an L2 serialization, all of which a random per-id
        // scan pays for rows it will never read twice.
        if (!options.skipCacheService) {
          cacheService
            .set(
              cacheKey,
              finalResult,
              ttl || 180,
              (tenantId || undefined) as string,
              // Single-doc point read → ENTRY (cold category: async reads skip
              // the LRU age update, so random per-id reads cannot evict hot
              // list entries the way CONTENT-category hits would).
              CacheCategory.ENTRY,
              // 🚀 Surgical invalidation: tag by the SPECIFIC doc so a write to
              // this entry clears only this key — NOT all 10k per-id entries.
              [`doc:${schema._id}:${entryId}`],
            )
            .catch(() => {});
        }
      } else {
        cacheService.recordMiss(cacheKey, (tenantId || undefined) as string);
      }
    }

    const hot = ensureSchemaHotFlags(schema);
    return presentRead(
      finalResult,
      schema,
      hot,
      readEncryptionContext(schema, tenantId, hot),
      options.user,
      options.system,
    );
  }

  async create(collectionId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const tSchema = writePhaseT0(options);
    const peeked = peekReadySchema(tenantId, collectionId);
    const schema = peeked
      ? peeked
      : PROFILE_WRITE_ENABLED
        ? await profileSpan("ns:getSchema", () => this.schemaOf(collectionId, tenantId))
        : await this.schemaOf(collectionId, tenantId);
    let hot = ensureSchemaHotFlags(schema);
    // A populated hot flag means every declared lazy widget was already loaded
    // before the flag plan was frozen. Avoid the per-write widget-name array,
    // registry scan, and resolved-Promise hop on warm write paths.
    if (hot._hasActiveWidgets === undefined) {
      await widgetRegistryService.ensureWidgets(widgetNamesOf(schema));
      hot = ensureSchemaHotFlags(schema);
    }
    markWritePhase(options, "schema", tSchema);

    // 🔒 SINGLETON: one document per collection, addressed by a deterministic id.
    // The existence probe is advisory — the `_id` primary key makes a concurrent
    // double create fail on the insert instead of persisting two rows.
    let createData = data;
    if ((schema as { singleton?: boolean }).singleton === true) {
      const singletonId = `singleton:${schema._id ?? collectionId}`;
      const existing = await this._dbAdapter.crud.findOne(
        this.getCollectionName(schema._id as string),
        { _id: singletonId } as any,
        { tenantId: tenantId as DatabaseId },
      );
      if (existing?.success && existing.data) {
        throw new AppError(`Singleton '${collectionId}' already exists`, 409, "SINGLETON_EXISTS");
      }
      createData =
        data && typeof data === "object" && !Array.isArray(data)
          ? { ...(data as Record<string, unknown>), _id: singletonId }
          : { _id: singletonId };
    }

    // 🛡️ ACTIVE SANITIZATION + hooks + write guard in one shared pass
    const tPrep = writePhaseT0(options);
    const m1 = PROFILE_WRITE_ENABLED ? profileMark("ns:sanitize+validate") : null;
    let entryData = prepareWritePayload(createData, schema, hot, {
      user,
      system,
      operation: "create",
      tenantId,
    });
    if (isThenable(entryData)) entryData = await entryData;
    m1?.();

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    // 🚪 Publication gate: workflows with gatePublication block direct
    // publishing of brand-new entries (no instance exists yet — the workflow
    // must approve before publish). System writes bypass the gate.
    if (
      !system &&
      ((data as { status?: string } | null)?.status === "publish" ||
        (data as { status?: string } | null)?.status === "published")
    ) {
      const workflowService = await getWorkflowServiceLazy();
      await workflowService.assertPublishAllowed(
        schema._id as string,
        (tenantId as string | undefined) ?? undefined,
        effectiveUser,
      );

      if (hot._hasRequiredFields && hot._requiredFields && hot._requiredFields.length > 0) {
        const missingFields: string[] = [];
        for (let i = 0; i < hot._requiredFields.length; i++) {
          const rf = hot._requiredFields[i];
          const val = (entryData as Record<string, unknown>)[rf.key];
          if (
            val === undefined ||
            val === null ||
            val === "" ||
            (Array.isArray(val) && val.length === 0)
          ) {
            missingFields.push(rf.name);
          }
        }
        if (missingFields.length > 0) {
          throw new AppError(
            missingFields.map((f) => `Field '${f}' is required when publishing`).join("; "),
            400,
            "FIELD_VALIDATION_ERROR",
          );
        }
      } else if (schema.fields && schema.fields.length > 0) {
        const { valid, missingFields } = validateRequiredFields(
          entryData,
          schema.fields as FieldInstance[],
        );
        if (!valid) {
          throw new AppError(
            missingFields.map((f) => `Field '${f}' is required when publishing`).join("; "),
            400,
            "FIELD_VALIDATION_ERROR",
          );
        }
      }
    }

    const mBefore = PROFILE_WRITE_ENABLED ? profileMark("ns:beforeSave") : null;
    let finalData = triggerLifecycleHook(
      this._dbAdapter,
      "beforeSave",
      collectionId,
      entryData,
      options,
      schema,
    );
    if (isThenable(finalData)) finalData = await finalData;
    mBefore?.();

    const m2 = PROFILE_WRITE_ENABLED ? profileMark("ns:widgets") : null;
    // Widget pipeline only when this payload actually hits a modifyRequest widget.
    // DateTime is inlined in prepareWritePayload — skip the async round-trip.
    if (hot._hasActiveWidgets && writeTouchesActiveWidgets(hot, finalData)) {
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
        skipSanitize: true,
      });
      finalData = payload[0] ?? finalData;
    }
    m2?.();
    markWritePhase(options, "prep", tPrep);

    const collectionName = this.getCollectionName(schema._id as string);
    const encCtx = fieldEncryptionContext(schema, tenantId);
    const tEnc = writePhaseT0(options);
    const mEnc = PROFILE_WRITE_ENABLED ? profileMark("ns:encrypt") : null;
    finalData = await encryptWritePayload(finalData, hot, encCtx);
    mEnc?.();
    markWritePhase(options, "encrypt", tEnc);
    const tDb = writePhaseT0(options);
    const m3 = PROFILE_WRITE_ENABLED ? profileMark("ns:persist") : null;
    const result = await persistWithOutbox(
      "create",
      async (txOpts) =>
        this._dbAdapter.crud.insert(collectionName, finalData, {
          tenantId: tenantId as DatabaseId,
          ...txOpts,
          ...(options.skipReturning ? { skipReturning: true } : {}),
        }),
      schema,
      tenantId,
      effectiveUser,
      (res) => String(res.data?._id ?? ""),
      (res) => res.data,
      { skipSideEffects: options.skipSideEffects },
    );
    m3?.();
    markWritePhase(options, "dbwrite", tDb);

    const tPost = writePhaseT0(options);
    const decryptedCreate = await decryptReadResult(result, hot, encCtx, { clone: true });
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
        decryptedCreate?.data ?? result.data,
        effectiveUser,
        options,
      );
      scheduleAfterOperation(
        schema,
        hot,
        decryptedCreate?.data ?? result.data,
        "create",
        effectiveUser,
        tenantId,
      );
      if (!shouldSkipWriteSideEffects(options)) {
        scheduleDefaultListWarm(schema._id as string, tenantId, effectiveUser, (warmOpts) =>
          this.find(collectionId, { tenantId: warmOpts.tenantId, user: warmOpts.user }),
        );
      }
    }
    markWritePhase(options, "postwrite", tPost);

    return decryptedCreate;
  }

  async update(collectionId: string, entryId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const tSchema = writePhaseT0(options);
    const peekedUpdate = peekReadySchema(tenantId, collectionId);
    const schema = peekedUpdate
      ? peekedUpdate
      : PROFILE_WRITE_ENABLED
        ? await profileSpan("ns:getSchema", () => this.schemaOf(collectionId, tenantId))
        : await this.schemaOf(collectionId, tenantId);
    let hot = ensureSchemaHotFlags(schema);
    // See create(): only schemas whose flag plan could not be frozen yet need
    // a lazy-factory check. This preserves widget processing on a cold schema
    // while keeping established PATCHes entirely synchronous before validation.
    if (hot._hasActiveWidgets === undefined) {
      await widgetRegistryService.ensureWidgets(widgetNamesOf(schema));
      hot = ensureSchemaHotFlags(schema);
    }
    markWritePhase(options, "schema", tSchema);

    const tPrep = writePhaseT0(options);
    const m1u = PROFILE_WRITE_ENABLED ? profileMark("ns:sanitize+validate") : null;
    let updateData = prepareWritePayload(data, schema, hot, {
      user,
      system,
      operation: "update",
      tenantId,
      entryId,
    });
    if (isThenable(updateData)) updateData = await updateData;
    m1u?.();

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    let preloadedExisting: any = null;

    // 🚪 Publication gate: workflows with gatePublication only allow status
    // "publish" while the entry's workflow instance is in a final state.
    // System writes (scheduled publishing, sync, imports) bypass the gate.
    if (
      !system &&
      ((data as { status?: string } | null)?.status === "publish" ||
        (data as { status?: string } | null)?.status === "published")
    ) {
      const workflowService = await getWorkflowServiceLazy();
      await workflowService.assertPublishAllowed(
        schema._id as string,
        (tenantId as string | undefined) ?? undefined,
        effectiveUser,
        entryId,
      );

      if (schema.fields && schema.fields.length > 0) {
        preloadedExisting = await this._dbAdapter.crud.findOne(
          this.getCollectionName(schema._id as string),
          { _id: entryId } as any,
          { tenantId: tenantId as DatabaseId },
        );
        const existingData =
          preloadedExisting.success && preloadedExisting.data
            ? (preloadedExisting.data as unknown as Record<string, unknown>)
            : undefined;
        const merged = {
          ...existingData,
          ...updateData,
        };
        if (hot._hasRequiredFields && hot._requiredFields && hot._requiredFields.length > 0) {
          const missingFields: string[] = [];
          for (let i = 0; i < hot._requiredFields.length; i++) {
            const rf = hot._requiredFields[i];
            const val = (merged as Record<string, unknown>)[rf.key];
            if (
              val === undefined ||
              val === null ||
              val === "" ||
              (Array.isArray(val) && val.length === 0)
            ) {
              missingFields.push(rf.name);
            }
          }
          if (missingFields.length > 0) {
            throw new AppError(
              missingFields.map((f) => `Field '${f}' is required when publishing`).join("; "),
              400,
              "FIELD_VALIDATION_ERROR",
            );
          }
        } else {
          const { valid, missingFields } = validateRequiredFields(
            merged,
            schema.fields as FieldInstance[],
          );
          if (!valid) {
            throw new AppError(
              missingFields.map((f) => `Field '${f}' is required when publishing`).join("; "),
              400,
              "FIELD_VALIDATION_ERROR",
            );
          }
        }
      }
    }

    const mBeforeU = PROFILE_WRITE_ENABLED ? profileMark("ns:beforeSave") : null;
    let finalData = triggerLifecycleHook(
      this._dbAdapter,
      "beforeSave",
      collectionId,
      updateData,
      options,
      schema,
    );
    if (isThenable(finalData)) finalData = await finalData;
    mBeforeU?.();

    const m2u = PROFILE_WRITE_ENABLED ? profileMark("ns:widgets") : null;
    if (hot._hasActiveWidgets && writeTouchesActiveWidgets(hot, finalData)) {
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
        skipSanitize: true,
      });
      finalData = payload[0] ?? finalData;
    }
    m2u?.();
    markWritePhase(options, "prep", tPrep);

    // 🛡️ REVISION TRACKING: for revision-enabled collections, snapshot the entry
    // BEFORE the write so the update can persist the previous version. Best-effort
    // — a failed snapshot must never fail the update itself.
    const revisionEnabled = schema.revision === true && !options.skipSideEffects;
    let previousSnapshot: any = null;
    const tSnap = writePhaseT0(options);
    const mRev =
      revisionEnabled && PROFILE_WRITE_ENABLED ? profileMark("ns:revision-snapshot") : null;
    if (revisionEnabled) {
      try {
        const prev =
          preloadedExisting ??
          (await this._dbAdapter.crud.findOne(
            this.getCollectionName(schema._id as string),
            { _id: entryId } as any,
            { tenantId: tenantId as DatabaseId },
          ));
        if (prev.success && prev.data) {
          previousSnapshot = prev.data;
        }
      } catch {
        /* best-effort */
      }
    }
    mRev?.();
    markWritePhase(options, "snapshot", tSnap);

    const encCtx = fieldEncryptionContext(schema, tenantId);
    const tEnc = writePhaseT0(options);
    const mEncU = PROFILE_WRITE_ENABLED ? profileMark("ns:encrypt") : null;
    finalData = await encryptWritePayload(finalData, hot, encCtx);
    mEncU?.();
    markWritePhase(options, "encrypt", tEnc);
    const tDb = writePhaseT0(options);
    const m3u = PROFILE_WRITE_ENABLED ? profileMark("ns:persist") : null;
    const result = await persistWithOutbox(
      "update",
      async (txOpts) =>
        this._dbAdapter.crud.update(
          this.getCollectionName(schema._id as string),
          entryId as DatabaseId,
          finalData,
          {
            tenantId: tenantId as DatabaseId,
            ...txOpts,
            // 🌐 ADAPTER-AGNOSTIC WRITE ACK: forwarded to every adapter so the row read-back
            // (SQL `RETURNING`, Mongo `findOneAndUpdate`) is skipped when the caller only
            // wants to know the write landed — see `LocalApiOptions.skipReturning`.
            ...(options.skipReturning ? { skipReturning: true } : {}),
            ...((options as any).fields ? { fields: (options as any).fields } : {}),
            ...((options as any).skipJson ? { skipJson: (options as any).skipJson } : {}),
          },
        ),
      schema,
      tenantId,
      effectiveUser,
      () => entryId,
      (res) => res.data,
      { skipSideEffects: options.skipSideEffects },
    );
    m3u?.();
    markWritePhase(options, "dbwrite", tDb);

    const tPost = writePhaseT0(options);
    const decryptedUpdate = await decryptReadResult(result, hot, encCtx, { clone: true });
    if (result && result.success && result.data) {
      // 🛡️ REVISION TRACKING: persist the pre-write snapshot (fire-and-forget).
      if (revisionEnabled && previousSnapshot) {
        void this.recordRevision(entryId, previousSnapshot, effectiveUser, tenantId);
      }
      // ⚡ Response-path: never await side effects — concurrent update RPS depends on this
      schedulePostWrite(
        this._dbAdapter,
        "update",
        schema,
        collectionId,
        tenantId,
        entryId,
        decryptedUpdate?.data ?? result.data,
        effectiveUser,
        options,
      );
      scheduleAfterOperation(
        schema,
        hot,
        decryptedUpdate?.data ?? result.data,
        "update",
        effectiveUser,
        tenantId,
      );
      if (!shouldSkipWriteSideEffects(options)) {
        scheduleDefaultListWarm(schema._id as string, tenantId, effectiveUser, (warmOpts) =>
          this.find(collectionId, { tenantId: warmOpts.tenantId, user: warmOpts.user }),
        );
      }
    }
    markWritePhase(options, "postwrite", tPost);

    return decryptedUpdate;
  }

  /**
   * Persist a revision snapshot for a revision-enabled collection update.
   * Fire-and-forget — revision history must never block or fail the write path.
   * The version is derived from the latest existing revision (+1).
   */
  private async recordRevision(
    entryId: string,
    previousData: any,
    user: any,
    tenantId: DatabaseId | null | undefined,
  ): Promise<void> {
    try {
      const history = await this._dbAdapter.content.revisions.getHistory(entryId as DatabaseId, {
        page: 1,
        pageSize: 1,
      });
      const items = history.success ? history.data.items : [];
      const latestVersion = items.length > 0 ? items[0].version : 0;
      await this._dbAdapter.content.revisions.create({
        contentId: entryId as DatabaseId,
        authorId: (user?._id || "system") as DatabaseId,
        data: previousData,
        version: latestVersion + 1,
        tenantId: tenantId ?? undefined,
      });
    } catch (err) {
      logger.debug(
        `[Revisions] Failed to record revision for ${entryId}: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  /**
   * Run a declared schema action (`schema.actions[name]`) on one entry.
   *
   * The action's own `permission` is the authorization check (admins bypass via
   * `isAdmin`) — the dispatcher deliberately does not also require
   * `collections:write`. `patch` and the object returned by `run` merge into one
   * update; `increment` goes through the adapter's atomic increment. An action
   * without a `permission` is admin-only (fail closed).
   */
  async runAction(
    collectionId: string,
    action: string,
    entryId: string,
    input: unknown,
    options: { user?: any; tenantId?: DatabaseId | null; roles?: unknown } = {},
  ): Promise<{ success: boolean; data?: unknown }> {
    const { user, tenantId, roles } = options;
    if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    if (typeof action !== "string" || !action) {
      throw new AppError("Action name is required", 400, "ACTION_REQUIRED");
    }
    if (typeof entryId !== "string" || !entryId) {
      throw new AppError("Action entry id is required", 400, "ACTION_ENTRY_REQUIRED");
    }

    const schema = await this.schemaOf(collectionId, tenantId);
    const actions = (schema as { actions?: Record<string, CollectionAction> }).actions;
    const definition: CollectionAction | undefined =
      actions && typeof actions === "object" ? actions[action] : undefined;
    if (!definition || typeof definition !== "object") {
      throw new AppError(
        `Action '${action}' is not defined on '${collectionId}'`,
        404,
        "ACTION_NOT_FOUND",
      );
    }

    if (!isAdmin(user)) {
      const allowed = Boolean(
        definition.permission &&
        hasPermissionWithRoles(
          user,
          definition.permission,
          Array.isArray(roles) ? (roles as Parameters<typeof hasPermissionWithRoles>[2]) : [],
        ),
      );
      if (!allowed) {
        throw new AppError(
          `Forbidden: missing permission for action '${action}'`,
          403,
          "ACTION_FORBIDDEN",
        );
      }
    }

    let patch: Record<string, unknown> =
      definition.patch && typeof definition.patch === "object" && !Array.isArray(definition.patch)
        ? { ...definition.patch }
        : {};

    if (typeof definition.run === "function") {
      const produced = await definition.run({
        collectionId,
        entryId,
        input,
        user,
        tenantId: tenantId ?? null,
        schema,
      });
      if (produced && typeof produced === "object" && !Array.isArray(produced)) {
        patch = { ...patch, ...(produced as Record<string, unknown>) };
      }
    }

    const result: { success: boolean; data?: unknown } =
      Object.keys(patch).length > 0
        ? await this.update(collectionId, entryId, patch, { user, tenantId })
        : await this.findById(collectionId, entryId, { tenantId });

    if (definition.increment && typeof definition.increment === "object") {
      const field = definition.increment.field;
      if (typeof field === "string" && field) {
        const incrementResult = await this._dbAdapter.crud.atomicIncrement?.(
          this.getCollectionName(schema._id as string),
          entryId as DatabaseId,
          field,
          typeof definition.increment.amount === "number" ? definition.increment.amount : 1,
          { tenantId: tenantId as DatabaseId },
        );
        if (incrementResult) return incrementResult;
      }
    }

    return result;
  }

  async delete(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const schema = await this.schemaOf(collectionId, tenantId);

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
      if (!shouldSkipWriteSideEffects(options)) {
        scheduleDefaultListWarm(schema._id as string, tenantId, effectiveUser, (warmOpts) =>
          this.find(collectionId, { tenantId: warmOpts.tenantId, user: warmOpts.user }),
        );
      }
    }

    return result;
  }
}
