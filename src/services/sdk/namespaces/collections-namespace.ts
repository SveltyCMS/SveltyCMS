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
 * - find-many.ts      — `find`/`search`/`count`/status facets (multi-row reads)
 * - find-one.ts       — `findById` cache gates + the `loadOneById` point read
 * - write-pipeline.ts — field prep, schema hooks, write guard, widget pipeline,
 *                       AES-256-GCM encrypt:true at rest
 * - delete-entry.ts   — soft/permanent delete + detached post-write effects
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
import { runAfterOperation } from "@src/content/schema-hooks";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { logger } from "@utils/logger";
import { AppError, raise } from "@utils/error-handling";
import { isAdmin } from "@src/databases/auth/constants";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import type { contentSystem as serverContentSystem } from "@src/content/index.server";
import type { FieldInstance, Schema } from "@src/content/types";
import { DEFAULT_REVISION_LIMIT } from "@src/content/revision-defaults";
import { type LocalApiOptions, type CollectionProxy } from "./types";
import { PROFILE_WRITE_ENABLED, profileSpan, profileMark } from "@utils/write-profiler";
import { nowISODateString } from "@src/utils/date";
import { redactRecord } from "@utils/field-access";
import { blockedGuardedNames, stripGuardedFilter, stripGuardedSort } from "@utils/guarded-query";
import {
  getReadConstraint,
  mergeAccessConstraint,
} from "@src/services/security/access-rule-service";
import { collectionTableName } from "@src/databases/core/collection-name";
import { validateRequiredFields } from "@src/widgets/widget-validation";
import { matchesVersion, normalizeExpectedVersion } from "@utils/optimistic-lock";
import { coerceFilterValues } from "@utils/collection-query-filters.server";

import {
  getDbModuleLazy,
  getHistoryServiceLazy,
  getTokenEngineLazy,
  getWorkflowServiceLazy,
} from "./collections/lazy-services";
import { evictRequestCache, getRequestCache, setRequestCache } from "./collections/request-cache";
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
import { workflowKnownAbsent } from "@src/services/background/workflow-presence";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import {
  assertEncryptedFieldsNotQueried,
  buildTenantQuery,
  decryptReadResult,
  decryptReadStream,
  normalizeRelationshipFilter,
  fieldEncryptionContext,
  readEncryptionContext,
  NO_ENCRYPTION_CONTEXT,
  DECRYPT_CLONE_OPTIONS,
} from "./collections/read-pipeline";
import { type StatusFacetCounts } from "@src/services/core/collection-filter-engine";
import {
  applyWidgetPipeline,
  encryptWritePayload,
  prepareWritePayload,
  writeTouchesActiveWidgets,
} from "./collections/write-pipeline";
import { compileRelationFilters } from "./collections/relation-filter";
import { collectJunctionPayload, syncJunctionLinks } from "./collections/junction-fields";
import { ownershipFilter, ownerValue, stripUnownedRows } from "./collections/access-filter";
export { ownershipFilter, ownerValue, stripUnownedRows };
import {
  casVersionCandidates,
  reconstructRevisionSnapshot,
  recordRevision,
  restoreEntryRevision,
  revisionLimitOf,
  type RecordRevisionOptions,
} from "./collections/revisions";
import { runCollectionAction } from "./collections/actions";
import { getCollectionExecutionPlan } from "./collections/execution-plan";
import {
  executeBulkCreate,
  executeBulkDelete,
  executeBulkUpdate,
  executeFindByIds,
  MAX_BULK_BATCH_SIZE,
} from "./collections/bulk-operations";
import { missingRequiredForPublish } from "./collections/bulk-validation";
export { MAX_BULK_BATCH_SIZE };
import {
  persistWithOutbox,
  schedulePostWrite,
  shouldSkipWriteSideEffects,
  triggerLifecycleHook,
} from "./collections/post-write";
import { scheduleDefaultListWarm } from "./collections/list-warm";
import {
  afterCommitQueueOf,
  runAfterCommit,
  transactionOf,
} from "./collections/transaction-context";
import {
  assertFilterableFields,
  countEntries,
  executeFind,
  executeSearch,
  getStatusFacets as collectStatusFacets,
  type FindOptions,
} from "./collections/find-many";
import { executeFindById } from "./collections/find-one";
import { executeDelete } from "./collections/delete-entry";

/** Cached lazy handle to the content engine — one module-registry lookup instead of one per call. */
let contentModulePromise: Promise<typeof import("@src/content/index.server")> | undefined;
function loadContentModule(): Promise<typeof import("@src/content/index.server")> {
  return (contentModulePromise ??= import("@src/content/index.server"));
}

type ContentSystem = typeof serverContentSystem;

/** Adapter envelope returned by `crud.findOne` — threaded through the write pipeline. */
type FindOneEnvelope = Awaited<ReturnType<IDBAdapter["crud"]["findOne"]>>;

/**
 * Scope a write must satisfy on its target row: `false` when the schema
 * declares no ownership, `null` when ownership is declared but the caller has
 * no usable user id (fail closed), the ownership fragment otherwise. `access`
 * carries the read-access rule fragment, if any.
 */
interface WriteOwnershipScope {
  scope: Record<string, unknown> | false | null;
  access: Record<string, unknown> | null;
}

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
 * Shared publish-gate check for create/update: `hot._requiredFields` is the
 * pre-compiled plan from schema-store, so the check is one pass with no
 * per-call field walk. Throws the same FIELD_VALIDATION_ERROR both write
 * lanes raised before (message and code unchanged).
 */
function assertRequiredFieldsForPublish(hot: SchemaHotFlags, payload: unknown): void {
  // The plan reader is shared with the bulk lane (`bulk-validation.ts`), so a
  // single publish and a bulk publish can never disagree about what is missing.
  const missingFields = missingRequiredForPublish(hot, payload);

  if (missingFields.length > 0) {
    throw new AppError(
      missingFields.map((f: string) => `Field '${f}' is required when publishing`).join("; "),
      400,
      "FIELD_VALIDATION_ERROR",
    );
  }
}

/**
 * True when the payload writes a field the publish gate cares about.
 *
 * Used to keep the existing-status read off ordinary updates: if no required
 * (or conditionally required) field is touched, an update cannot make an
 * already-published entry invalid.
 */
function touchesRequiredFields(hot: SchemaHotFlags, payload: unknown): boolean {
  const record = (payload ?? {}) as Record<string, unknown>;
  for (const field of hot._requiredFields ?? []) {
    if (Object.hasOwn(record, field.key)) return true;
  }
  for (const field of hot._conditionallyRequiredFields ?? []) {
    if (Object.hasOwn(record, field.key)) return true;
  }
  return false;
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

/**
 * Best-effort IndexNow ping for freshly published entries (premium SEO,
 * fire-and-forget). The dynamic import keeps the IndexNow service — settings,
 * license check, egress fetch — out of the namespace's eager module graph.
 */
function scheduleIndexNowPing(
  collectionId: string,
  document: unknown,
  tenantId: DatabaseId | null | undefined,
): void {
  if (!document || typeof document !== "object") return;
  const status = (document as { status?: unknown }).status;
  if (status !== "publish" && status !== "published") return;
  void import("@src/services/content/seo/indexnow.server")
    .then(({ notifyIndexNowOnPublish }) =>
      notifyIndexNowOnPublish({
        collectionId,
        document: document as Record<string, unknown>,
        tenantId: tenantId ?? undefined,
      }),
    )
    .catch((err) => {
      logger.debug("[IndexNow] Publish ping scheduling failed (non-fatal)", { error: err });
    });
}

export class CollectionsNamespace {
  private _proxy: CollectionProxy;

  constructor(
    public _dbAdapter: IDBAdapter,
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
   * Row ownership on a write. No-op when the schema declares no ownership or
   * the caller is admin/system. A foreign row is 404 so existence is not
   * revealed. A missing row returns so the adapter's own update/delete 404
   * stays the single response.
   */
  assertEntryOwnership(
    schema: Schema,
    entryId: string,
    tenantId: DatabaseId | null | undefined,
    user: unknown,
    system?: boolean,
  ): void | Promise<void> {
    const ownership = this.resolveWriteOwnership(schema, tenantId, user, system);
    if (ownership.scope === null) raise(404, "Entry not found", "NOT_FOUND");
    if (ownership.scope === false && !ownership.access) return;
    return this._dbAdapter.crud
      .findOne(
        this.getCollectionName(schema._id as string),
        mergeAccessConstraint({ _id: entryId }, ownership.access) as never,
        {
          tenantId: tenantId as DatabaseId,
        },
      )
      .then((existing) => this.assertOwnedWriteRow(existing, ownership));
  }

  /**
   * Resolve the ownership/access scope a write must satisfy before touching the
   * row. Shared by `assertEntryOwnership` and `update()` so the write pipeline
   * resolves the scope once and can reuse a single loaded row.
   */
  private resolveWriteOwnership(
    schema: Schema,
    tenantId: DatabaseId | null | undefined,
    user: unknown,
    system?: boolean,
  ): WriteOwnershipScope {
    return {
      scope: ownershipFilter(schema, user, system),
      access: getReadConstraint(schema.name || String(schema._id), {
        user: user as { _id?: unknown; role?: unknown } | null | undefined,
        role: (user as { role?: string } | undefined)?.role,
        tenantId: tenantId ? String(tenantId) : null,
      }),
    };
  }

  /**
   * Validate a loaded row against the resolved write scope. A foreign row and a
   * row hidden by an access rule both answer 404 so existence is not revealed;
   * a missing row returns so the adapter's own update/delete 404 stays the
   * single response.
   */
  private assertOwnedWriteRow(
    existing: FindOneEnvelope | null | undefined,
    ownership: WriteOwnershipScope,
  ): void {
    const { scope, access } = ownership;
    if (!existing?.success || !existing.data) {
      // A row hidden by an access rule must look absent, not forbidden.
      if (access) raise(404, "Entry not found", "NOT_FOUND");
      return;
    }
    if (!scope) return;
    const field = Object.keys(scope)[0] ?? "";
    const value = field ? ownerValue(existing.data, field) : undefined;
    if (value === undefined || value === null || String(value) !== String(scope[field])) {
      raise(404, "Entry not found", "NOT_FOUND");
    }
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

  /**
   * Write-access gate for a collection entry WITHOUT writing it — the exact
   * ownership/access-rule check `update()` runs, exposed for the drafts lane
   * (autosave must not park a draft against an entry the caller cannot edit).
   * Mirrors `update()`'s fail-closed behaviour for anonymous callers and
   * resolves the schema first so an unknown collection is a 404.
   */
  public async assertEntryWriteAccess(
    collectionId: string,
    entryId: string,
    options: LocalApiOptions = {},
  ): Promise<void> {
    const { user, tenantId, system } = options;
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    if (!entryId) raise(400, "Entry id is required.", "ENTRY_ID_REQUIRED");
    const schema = await this.schemaOf(collectionId, tenantId);
    if (!system) {
      const ownership = this.assertEntryOwnership(schema, entryId, tenantId, user, system);
      if (ownership) await ownership;
    }
  }

  /** Warm schemas skip the async getSchema microtask and the ensureWidgets async hop
   * when hot-flags are already stamped (common on every request after first access).
   */
  async schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema> {
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

    // Single L1 lookup — `hasRequestCache` + `getRequestCache` was two LRU
    // reads and two recency promotions per hit (same pattern as readThroughCache).
    const cachedList = getRequestCache(cacheKey);
    if (cachedList !== undefined) {
      return cachedList;
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
    } catch (error) {
      logger.debug("[collections-namespace] suppressed error", error);
    }

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
    } catch (error) {
      logger.debug("[collections-namespace] suppressed error", error);
    }

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
    return executeSearch(
      {
        _dbAdapter: this._dbAdapter,
        schemaOf: (id, tenantId) => this.schemaOf(id, tenantId),
        getCollectionName: (id) => this.getCollectionName(id),
        getContentSystem,
      },
      query,
      options,
    );
  }

  async find(collectionId: string, options: any = {}) {
    return executeFind(this, collectionId, options as FindOptions);
  }

  /**
   * Status facet counts for filter chips (P1). Tenant-scoped.
   *
   * SWR-cached under `collection:{id}:facets:{tenant}` with the list's tag
   * contract, so `cacheService.invalidateCollection(id)` also drops the counts.
   */
  public async getStatusFacets(
    collectionIdOrSchema: string | Schema,
    input: {
      tenantId?: string | DatabaseId | null;
      totalItems?: number;
    } = {},
  ): Promise<StatusFacetCounts> {
    return collectStatusFacets(this, collectionIdOrSchema, input);
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
      /** HTTP callers opt in: unknown filter keys become `400 FILTER_UNKNOWN_FIELD`. */
      validateFilter?: boolean;
      publicationFilter?: "published" | "draft" | "all";
    } = {},
  ) {
    const { tenantId, user } = options;
    // Shared getSchema path — findStreaming previously bypassed the schema cache
    // via cs.getCollection, causing duplicate resolution per stream.
    const schema = await this.schemaOf(collectionId, tenantId);
    let streamInputFilter = options.filter as Record<string, unknown> | undefined;
    if (options.validateFilter === true) {
      assertFilterableFields(schema, options.filter);
      streamInputFilter = coerceFilterValues(schema, streamInputFilter);
    }
    const hot = ensureSchemaHotFlags(schema);
    const encCtx = readEncryptionContext(schema, tenantId, hot);
    // 🚀 Avoid the `{ ...options.filter }` spread allocation when filter is empty or
    // already a plain object with no relational operators — normalizeRelationshipFilter
    // only clones when an operator rewrite is needed (lazy-clone internally).
    const streamGuarded = blockedGuardedNames(schema, user, options.system);
    const normalizedStreamFilter = stripGuardedFilter(
      normalizeRelationshipFilter(streamInputFilter ?? {}),
      streamGuarded,
    );
    const streamSortField = stripGuardedSort(options.sortField, streamGuarded);
    assertEncryptedFieldsNotQueried(normalizedStreamFilter, hot, streamSortField);

    const ownership = ownershipFilter(schema, user, options.system);
    if (ownership === null) return (async function* emptyStream() {})();
    const accessConstraint = getReadConstraint(schema.name || String(schema._id), {
      user,
      role: user?.role,
      tenantId: tenantId ? String(tenantId) : null,
    });
    const resolvedStreamFilter = await compileRelationFilters(normalizedStreamFilter, schema, {
      dbAdapter: this._dbAdapter.crud,
      getCollectionName: (id) => this.getCollectionName(id),
      resolveTargetSchema: (id) => this.schemaOf(id, tenantId),
      tenantId,
      user,
      system: options.system,
    });
    const scopedStreamFilter = mergeAccessConstraint(
      ownership ? { ...resolvedStreamFilter, ...ownership } : resolvedStreamFilter,
      accessConstraint,
    );

    const { query } = buildTenantQuery(
      scopedStreamFilter,
      tenantId,
      { user: options.user, system: options.system },
      options.publicationFilter,
    );
    const findOptions = {
      limit: options.limit,
      offset: options.offset,
      sort: streamSortField
        ? ([[streamSortField, options.sortDirection || "desc"]] as [string, "asc" | "desc"][])
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
      validateFilter?: boolean;
      publicationFilter?: "published" | "draft" | "all";
    } = {},
  ) {
    return countEntries(this, collectionId, options);
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
    const result = await HistoryService.getRevisions({
      collectionId,
      entryId,
      tenantId: tenantId as string,
      dbAdapter: this._dbAdapter,
      limit: limit || 100,
      page: page || 1,
    });

    // Delta payloads are a storage encoding, not the public shape. Callers (the
    // history UI and the undo path) expect a complete snapshot under `data`, so
    // each delta is expanded against its nearest baseline before it leaves here.
    const rows = (result as { data?: { items?: unknown[] } }).data?.items;
    if (result.success && Array.isArray(rows) && rows.length > 0) {
      const store = this._dbAdapter.content.revisions as unknown as Parameters<
        typeof reconstructRevisionSnapshot
      >[0];
      const scope = tenantId ? { tenantId: tenantId as DatabaseId } : undefined;
      const expanded = await Promise.all(
        rows.map(async (item) => {
          const row = item as Record<string, unknown>;
          const version = Number(row.version);
          if (!Number.isInteger(version) || version < 1) return item;
          const snapshot = await reconstructRevisionSnapshot(
            store,
            entryId as DatabaseId,
            version,
            scope,
          );
          return snapshot ? { ...row, data: snapshot } : item;
        }),
      );
      (result as { data: { items: unknown[] } }).data.items = expanded;
    }
    return result;
  }

  async bulkCreate(collectionId: string, data: any[], options: LocalApiOptions = {}) {
    return executeBulkCreate(this, collectionId, data, options);
  }

  async bulkUpdate(
    collectionId: string,
    updates: Array<{ id: string; data: any }>,
    options: LocalApiOptions = {},
  ) {
    return executeBulkUpdate(this, collectionId, updates, options);
  }

  async bulkDelete(
    collectionId: string,
    ids: string[],
    options: LocalApiOptions & { permanent?: boolean } = {},
  ) {
    return executeBulkDelete(this, collectionId, ids, options);
  }

  /**
   * Raw id lookup — one `WHERE _id IN (...)` query, no widget modifyRequest.
   * Used by bulk clone so source rows are not processed twice.
   */
  async findByIds(collectionId: string, ids: string[], options: LocalApiOptions = {}) {
    return executeFindByIds(this, collectionId, ids, options);
  }

  async findById(collectionId: string, entryId: string, options: LocalApiOptions = {}) {
    return executeFindById(this, collectionId, entryId, options);
  }

  async create(collectionId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    // Adapter handle supplied by a transactional caller (draft promotion).
    // Absent for every standalone create, leaving the write path unchanged.
    const transaction = transactionOf(options);
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const tSchema = writePhaseT0(options);
    const peeked = peekReadySchema(tenantId, collectionId);
    const schema = peeked
      ? peeked
      : PROFILE_WRITE_ENABLED
        ? await profileSpan("ns:getSchema", () => this.schemaOf(collectionId, tenantId))
        : await this.schemaOf(collectionId, tenantId);
    let hot = ensureSchemaHotFlags(schema);
    const plan = getCollectionExecutionPlan(schema);
    // A populated hot flag means every declared lazy widget was already loaded
    // before the flag plan was frozen. Avoid the per-write widget-name array,
    // registry scan, and resolved-Promise hop on warm write paths.
    if (plan.hasWidgets && hot._hasActiveWidgets === undefined) {
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
        { tenantId: tenantId as DatabaseId, ...(transaction ? { transaction } : {}) },
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
      skipValidation: options.skipValidation,
    });
    if (isThenable(entryData)) entryData = await entryData;
    m1?.();

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    // 🚪 Publication gate:
    // 1) Workflows with gatePublication block direct publishing of brand-new entries
    //    (no instance exists yet — the workflow must approve before publish).
    // 2) Required fields for publish must always be validated when publishing.
    // System writes bypass both gates.
    const requestedStatus = (data as { status?: string } | null)?.status;
    const isPublishing =
      !system && (requestedStatus === "publish" || requestedStatus === "published");

    if (isPublishing) {
      if (
        plan.hasWorkflows &&
        !isAdmin(effectiveUser) &&
        effectiveUser?.role !== "admin" &&
        !workflowKnownAbsent(schema._id as string, tenantId as string | undefined)
      ) {
        const workflowService = await getWorkflowServiceLazy();
        await workflowService.assertPublishAllowed(
          schema._id as string,
          (tenantId as string | undefined) ?? undefined,
          effectiveUser,
        );
      }

      if (
        (hot._hasRequiredFields && hot._requiredFields && hot._requiredFields.length > 0) ||
        (hot._hasConditionallyRequiredFields &&
          hot._conditionallyRequiredFields &&
          hot._conditionallyRequiredFields.length > 0)
      ) {
        assertRequiredFieldsForPublish(hot, entryData);
      } else if (schema.fields && schema.fields.length > 0) {
        const { valid, missingFields } = validateRequiredFields(
          entryData,
          schema.fields as FieldInstance[],
        );
        if (!valid) {
          throw new AppError(
            missingFields.map((f: string) => `Field '${f}' is required when publishing`).join("; "),
            400,
            "FIELD_VALIDATION_ERROR",
          );
        }
      }
    }

    const mBefore = PROFILE_WRITE_ENABLED ? profileMark("ns:beforeSave") : null;
    let finalData = plan.hasHooks
      ? triggerLifecycleHook(
          this._dbAdapter,
          "beforeSave",
          collectionId,
          entryData,
          options,
          schema,
        )
      : entryData;
    if (isThenable(finalData)) finalData = await finalData;
    mBefore?.();

    const m2 = PROFILE_WRITE_ENABLED ? profileMark("ns:widgets") : null;
    // Widget pipeline only when this payload actually hits a modifyRequest widget.
    // DateTime is inlined in prepareWritePayload — skip the async round-trip.
    if (plan.hasWidgets && hot._hasActiveWidgets && writeTouchesActiveWidgets(hot, finalData)) {
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

    // 🔗 Junction (many-to-many) fields: extract the desired edges and keep them
    // out of the row. The edges are written after the row is durable.
    const junction = collectJunctionPayload(schema, finalData as Record<string, unknown>);
    if (junction.present.length > 0) finalData = junction.stripped;

    const collectionName = this.getCollectionName(schema._id as string);
    const encCtx = plan.hasEncryption
      ? fieldEncryptionContext(schema, tenantId)
      : NO_ENCRYPTION_CONTEXT;
    const tEnc = writePhaseT0(options);
    const mEnc = PROFILE_WRITE_ENABLED ? profileMark("ns:encrypt") : null;
    // `encryptWritePayload` is a synchronous identity — no Promise, no context
    // read — for schemas without `encrypt: true` fields.
    const encryptedCreate = plan.hasEncryption
      ? encryptWritePayload(finalData, hot, encCtx)
      : finalData;
    finalData = isThenable(encryptedCreate) ? await encryptedCreate : encryptedCreate;
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
      {
        skipSideEffects: options.skipSideEffects,
        skipReturning: options.skipReturning,
        ...(transaction ? { transaction, afterCommit: afterCommitQueueOf(options) } : {}),
      },
    );
    m3?.();
    markWritePhase(options, "dbwrite", tDb);

    const tPost = writePhaseT0(options);
    const decryptedCreate =
      options.skipReturning || !plan.hasEncryption
        ? result
        : decryptReadResult(result, hot, encCtx, DECRYPT_CLONE_OPTIONS);

    // 🔗 Persist the junction edges for this row. Idempotent (deterministic edge
    // ids), so a retry after a partial failure converges.
    if (junction.present.length > 0 && result?.success) {
      const createdId = String(
        (result.data as { _id?: unknown } | null)?._id ??
          (finalData as { _id?: unknown })._id ??
          "",
      );
      if (createdId) {
        await syncJunctionLinks(this._dbAdapter, {
          tenantId,
          sourceCollection: String(schema._id),
          sourceId: createdId,
          links: junction.present,
          transaction,
        });
        // Return the values the caller sent (the row itself no longer holds them).
        for (const link of junction.present) {
          const ids = link.desired.map((entry) => entry.id);
          if (result.data && typeof result.data === "object") {
            (result.data as Record<string, unknown>)[link.fieldName] = ids;
          }
          if (decryptedCreate?.data && typeof decryptedCreate.data === "object") {
            (decryptedCreate.data as Record<string, unknown>)[link.fieldName] = ids;
          }
        }
      } else {
        logger.warn(
          `[collections] Cannot link many-to-many field(s) on ${String(schema._id)}: the adapter returned no _id (skipReturning).`,
        );
      }
    }
    if (result && result.success && result.data) {
      const createdId = result.data!._id as string;
      // Resolved once — the three side-effect schedules below shared the same
      // `decryptedCreate?.data ?? result.data` expression.
      const postWriteDoc = decryptedCreate?.data ?? result.data;
      // ⚡ Response-path: never await side effects — concurrent create RPS depends on this.
      // Inside a transaction they are queued and replayed only after COMMIT.
      runAfterCommit(options, () => {
        schedulePostWrite(
          this._dbAdapter,
          "create",
          schema,
          collectionId,
          tenantId,
          createdId,
          postWriteDoc,
          effectiveUser,
          options,
        );
        scheduleAfterOperation(schema, hot, postWriteDoc, "create", effectiveUser, tenantId);
        if (!shouldSkipWriteSideEffects(options) && !options.skipReturning) {
          scheduleIndexNowPing(collectionId, postWriteDoc, tenantId);
          scheduleDefaultListWarm(schema._id as string, tenantId, effectiveUser, (warmOpts) =>
            this.find(collectionId, { tenantId: warmOpts.tenantId, user: warmOpts.user }),
          );
        }
      });
    }
    markWritePhase(options, "postwrite", tPost);

    return decryptedCreate;
  }

  async update(collectionId: string, entryId: string, data: any, options: LocalApiOptions = {}) {
    const { user, tenantId, system } = options;
    // Adapter handle supplied by a transactional caller (draft promotion).
    // Absent for every standalone update, leaving the write path unchanged.
    const transaction = transactionOf(options);
    if (!user && !system) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    const tSchema = writePhaseT0(options);
    const peekedUpdate = peekReadySchema(tenantId, collectionId);
    const schema = peekedUpdate
      ? peekedUpdate
      : PROFILE_WRITE_ENABLED
        ? await profileSpan("ns:getSchema", () => this.schemaOf(collectionId, tenantId))
        : await this.schemaOf(collectionId, tenantId);
    let hot = ensureSchemaHotFlags(schema);
    const plan = getCollectionExecutionPlan(schema);
    // See create(): only schemas whose flag plan could not be frozen yet need
    // a lazy-factory check. This preserves widget processing on a cold schema
    // while keeping established PATCHes entirely synchronous before validation.
    if (plan.hasWidgets && hot._hasActiveWidgets === undefined) {
      await widgetRegistryService.ensureWidgets(widgetNamesOf(schema));
      hot = ensureSchemaHotFlags(schema);
    }
    markWritePhase(options, "schema", tSchema);

    // Resolve the write scope once and thread the loaded row through the whole
    // pre-write pipeline. Ownership, the optimistic-lock comparison, required
    // field validation and the revision snapshot all need the same document; a
    // single read serves them instead of up to three sequential `findOne`s.
    const expectedVersion = normalizeExpectedVersion(options.expectedVersion);
    const tableName = this.getCollectionName(schema._id as string);
    const ownership = system ? null : this.resolveWriteOwnership(schema, tenantId, user, system);
    if (ownership?.scope === null) raise(404, "Entry not found", "NOT_FOUND");
    const ownershipNeedsRow =
      ownership !== null && (ownership.scope !== false || ownership.access !== null);
    let preloadedExisting: FindOneEnvelope | null = null;
    const loadExistingRow = async (): Promise<FindOneEnvelope> => {
      if (preloadedExisting) return preloadedExisting;
      preloadedExisting = await this._dbAdapter.crud.findOne(
        tableName,
        mergeAccessConstraint({ _id: entryId }, ownership?.access) as never,
        {
          tenantId: tenantId as DatabaseId,
          // A cached row can be older than the write that just landed
          // (`schedulePostWrite` invalidates asynchronously), which would make a
          // stale `If-Match` look current. The lock check must read the row.
          ...(expectedVersion !== null ? { bypassCache: true } : {}),
          ...(transaction ? { transaction } : {}),
        },
      );
      return preloadedExisting;
    };
    if (ownershipNeedsRow && ownership) {
      this.assertOwnedWriteRow(await loadExistingRow(), ownership);
    }

    const tPrep = writePhaseT0(options);
    const m1u = PROFILE_WRITE_ENABLED ? profileMark("ns:sanitize+validate") : null;
    let updateData = prepareWritePayload(data, schema, hot, {
      user,
      system,
      operation: "update",
      tenantId,
      entryId,
      skipValidation: options.skipValidation,
    });
    if (isThenable(updateData)) updateData = await updateData;
    m1u?.();

    const effectiveUser = system ? { _id: "system", role: "admin" } : user;

    // 🔒 OPTIMISTIC LOCKING: the caller tells us which version it loaded.
    // `casRowVersion` is the value the UPDATE must still match — the comparison
    // happens inside the write (compare-and-set), this pre-check only fails
    // fast so a stale edit never reaches validation/hooks.
    let casRowVersion: unknown = null;
    if (expectedVersion !== null) {
      const existing = await loadExistingRow();
      if (!existing.success || !existing.data) {
        raise(404, `Entry ${entryId} was not found.`, "NOT_FOUND");
      }
      const currentRow = existing.data as unknown as Record<string, unknown>;
      const currentVersion = currentRow.updatedAt ?? null;
      if (!matchesVersion(currentVersion, expectedVersion)) {
        raise(
          409,
          "This entry was changed by someone else. Reload it and apply your changes again.",
          "VERSION_CONFLICT",
          { currentVersion },
        );
      }
      casRowVersion = currentVersion;
    }

    // 🚪 Publication gate: workflows with gatePublication only allow status
    // "publish" while the entry's workflow instance is in a final state.
    // System writes (scheduled publishing, sync, imports) bypass the gate.
    const requestedStatus = (data as { status?: string } | null)?.status;
    const explicitPublish = requestedStatus === "publish" || requestedStatus === "published";
    // 🛡️ SERVER-SIDE REQUIRED/requiredIf: validate on an explicit publish AND on
    // any update that clears a required field of an entry that is ALREADY
    // published. The old shape only checked explicit publish transitions, so a
    // direct API PATCH without `status` could blank a required field and leave a
    // published entry invalid (the client hid the field, the server did not).
    if (!system && (explicitPublish || touchesRequiredFields(hot, updateData))) {
      if (explicitPublish && plan.hasWorkflows) {
        if (
          !isAdmin(effectiveUser) &&
          effectiveUser?.role !== "admin" &&
          !workflowKnownAbsent(schema._id as string, tenantId as string | undefined)
        ) {
          const workflowService = await getWorkflowServiceLazy();
          await workflowService.assertPublishAllowed(
            schema._id as string,
            (tenantId as string | undefined) ?? undefined,
            effectiveUser,
            entryId,
          );
        }
      }

      if (schema.fields && schema.fields.length > 0) {
        const existing = await loadExistingRow();
        const existingData =
          existing.success && existing.data
            ? (existing.data as unknown as Record<string, unknown>)
            : undefined;
        const merged = {
          ...existingData,
          ...updateData,
        };
        // Without an explicit status the entry keeps the status it already has.
        const effectiveStatus = explicitPublish ? "publish" : existingData?.status;
        const staysPublished = effectiveStatus === "publish" || effectiveStatus === "published";
        if (staysPublished) {
          if (
            (hot._hasRequiredFields && hot._requiredFields && hot._requiredFields.length > 0) ||
            (hot._hasConditionallyRequiredFields &&
              hot._conditionallyRequiredFields &&
              hot._conditionallyRequiredFields.length > 0)
          ) {
            assertRequiredFieldsForPublish(hot, merged);
          } else {
            const { valid, missingFields } = validateRequiredFields(
              merged,
              schema.fields as FieldInstance[],
            );
            if (!valid) {
              throw new AppError(
                missingFields
                  .map((f: string) => `Field '${f}' is required when publishing`)
                  .join("; "),
                400,
                "FIELD_VALIDATION_ERROR",
              );
            }
          }
        }
      }
    }

    const mBeforeU = PROFILE_WRITE_ENABLED ? profileMark("ns:beforeSave") : null;
    let finalData = plan.hasHooks
      ? triggerLifecycleHook(
          this._dbAdapter,
          "beforeSave",
          collectionId,
          updateData,
          options,
          schema,
        )
      : updateData;
    if (isThenable(finalData)) finalData = await finalData;
    mBeforeU?.();

    const m2u = PROFILE_WRITE_ENABLED ? profileMark("ns:widgets") : null;
    if (plan.hasWidgets && hot._hasActiveWidgets && writeTouchesActiveWidgets(hot, finalData)) {
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

    // 🔗 Junction fields present in this request are extracted and stripped; an
    // omitted field leaves its existing edges untouched.
    const junction = collectJunctionPayload(schema, finalData as Record<string, unknown>);
    if (junction.present.length > 0) finalData = junction.stripped;

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
        const prev = await loadExistingRow();
        if (prev.success && prev.data) {
          previousSnapshot = prev.data;
        }
      } catch {
        /* best-effort */
      }
    }
    mRev?.();
    markWritePhase(options, "snapshot", tSnap);

    const encCtx = plan.hasEncryption
      ? fieldEncryptionContext(schema, tenantId)
      : NO_ENCRYPTION_CONTEXT;
    const tEnc = writePhaseT0(options);
    const mEncU = PROFILE_WRITE_ENABLED ? profileMark("ns:encrypt") : null;
    // `encryptWritePayload` is a synchronous identity — no Promise, no context
    // read — for schemas without `encrypt: true` fields.
    const encryptedUpdate = plan.hasEncryption
      ? encryptWritePayload(finalData, hot, encCtx)
      : finalData;
    finalData = isThenable(encryptedUpdate) ? await encryptedUpdate : encryptedUpdate;
    mEncU?.();
    markWritePhase(options, "encrypt", tEnc);
    const tDb = writePhaseT0(options);
    const m3u = PROFILE_WRITE_ENABLED ? profileMark("ns:persist") : null;
    const writeOptions = {
      tenantId: tenantId as DatabaseId,
      // 🌐 ADAPTER-AGNOSTIC WRITE ACK: forwarded to every adapter so the row read-back
      // (SQL `RETURNING`, Mongo `findOneAndUpdate`) is skipped when the caller only
      // wants to know the write landed — see `LocalApiOptions.skipReturning`.
      ...(options.skipReturning ? { skipReturning: true } : {}),
      ...((options as any).fields ? { fields: (options as any).fields } : {}),
      ...((options as any).skipJson ? { skipJson: (options as any).skipJson } : {}),
    };
    const result = await persistWithOutbox(
      "update",
      async (txOpts) => {
        if (casRowVersion === null) {
          return this._dbAdapter.crud.update(
            this.getCollectionName(schema._id as string),
            entryId as DatabaseId,
            finalData,
            { ...writeOptions, ...txOpts },
          );
        }
        // 🔒 Compare-and-set: one `UPDATE … WHERE _id = ? AND updatedAt = ?`.
        // Zero matched rows means another writer won the race after the fast
        // pre-check, so this is a genuine conflict, not a missing row.
        //
        // The SDK hands `updatedAt` back as an ISO string. MariaDB/MySQL cannot
        // parse the trailing `Z` in a comparison and MongoDB stores a real Date,
        // so the raw token matched zero rows on those engines even when nothing
        // had changed. Try the Date first, then the raw value, and only then call
        // it a conflict — both attempts use the version the caller loaded.
        const casCandidates = casVersionCandidates(casRowVersion);
        let cas = await this._dbAdapter.crud.updateMany(
          tableName,
          { _id: entryId, updatedAt: casCandidates[0] } as any,
          finalData as any,
          { ...writeOptions, ...txOpts },
        );
        for (const candidate of casCandidates.slice(1)) {
          if (cas.success && (cas.data?.modifiedCount ?? 0) > 0) break;
          cas = await this._dbAdapter.crud.updateMany(
            tableName,
            { _id: entryId, updatedAt: candidate } as any,
            finalData as any,
            { ...writeOptions, ...txOpts },
          );
        }
        if (!cas.success) return cas;
        if ((cas.data?.modifiedCount ?? 0) === 0) {
          const current = await this._dbAdapter.crud.findOne(tableName, { _id: entryId } as any, {
            tenantId: tenantId as DatabaseId,
            bypassCache: true,
          });
          const currentVersion = current.success
            ? ((current.data as unknown as Record<string, unknown> | null)?.updatedAt ?? null)
            : null;
          // The CAS filter carries a timestamp column in an engine-specific
          // representation; MariaDB/MongoDB can reject an unchanged row even when
          // no writer intervened (the filter binds nothing). Re-verify against the
          // version the caller loaded and, if it is still current, write without
          // the compare-and-set instead of reporting a false conflict.
          if (current.success && current.data && matchesVersion(currentVersion, expectedVersion)) {
            const plain = await this._dbAdapter.crud.update(
              tableName,
              entryId as DatabaseId,
              finalData,
              { ...writeOptions, ...txOpts },
            );
            if (!plain.success) return plain;
            return this._dbAdapter.crud.findOne(tableName, { _id: entryId } as any, {
              tenantId: tenantId as DatabaseId,
              ...txOpts,
            });
          }
          raise(
            409,
            "This entry was changed by someone else. Reload it and apply your changes again.",
            "VERSION_CONFLICT",
            { currentVersion },
          );
        }
        // `updateMany` reports a count, not the row — read it once for the
        // response and the post-write side effects.
        return this._dbAdapter.crud.findOne(
          this.getCollectionName(schema._id as string),
          { _id: entryId } as any,
          { tenantId: tenantId as DatabaseId, ...txOpts },
        );
      },
      schema,
      tenantId,
      effectiveUser,
      () => entryId,
      (res) => res.data,
      {
        skipSideEffects: options.skipSideEffects,
        skipReturning: options.skipReturning,
        ...(transaction ? { transaction, afterCommit: afterCommitQueueOf(options) } : {}),
      },
    );
    m3u?.();
    markWritePhase(options, "dbwrite", tDb);

    const tPost = writePhaseT0(options);
    const decryptedUpdate =
      options.skipReturning || !plan.hasEncryption
        ? result
        : decryptReadResult(result, hot, encCtx, DECRYPT_CLONE_OPTIONS);

    // 🔗 Sync the junction edges the request supplied.
    if (junction.present.length > 0 && result?.success) {
      await syncJunctionLinks(this._dbAdapter, {
        tenantId,
        sourceCollection: String(schema._id),
        sourceId: entryId,
        links: junction.present,
        transaction,
      });
      for (const link of junction.present) {
        const ids = link.desired.map((entry) => entry.id);
        if (result.data && typeof result.data === "object") {
          (result.data as Record<string, unknown>)[link.fieldName] = ids;
        }
        if (decryptedUpdate?.data && typeof decryptedUpdate.data === "object") {
          (decryptedUpdate.data as Record<string, unknown>)[link.fieldName] = ids;
        }
      }
    }
    if (result && result.success && result.data) {
      // 🛡️ REVISION TRACKING: persist the pre-write snapshot before the request
      // returns. The write itself is already durable, but a fire-and-forget call
      // could be dropped by teardown and lose the revision entirely.
      // Inside a promotion transaction the snapshot joins that transaction and a
      // failure aborts it (`strict`), so a committed live write always has its
      // revision.
      if (revisionEnabled && previousSnapshot) {
        const revisionOptions: RecordRevisionOptions | undefined = transaction
          ? { transaction, strict: true }
          : undefined;
        await this.recordRevision(
          entryId,
          previousSnapshot,
          effectiveUser,
          tenantId,
          revisionLimitOf(schema),
          revisionOptions,
        );
      }
      // Resolved once — the three side-effect schedules below shared the same
      // `decryptedUpdate?.data ?? result.data` expression.
      const postWriteDoc = decryptedUpdate?.data ?? result.data;
      // ⚡ Response-path: never await side effects — concurrent update RPS depends on this.
      // Inside a transaction they are queued and replayed only after COMMIT.
      runAfterCommit(options, () => {
        schedulePostWrite(
          this._dbAdapter,
          "update",
          schema,
          collectionId,
          tenantId,
          entryId,
          postWriteDoc,
          effectiveUser,
          options,
        );
        scheduleAfterOperation(schema, hot, postWriteDoc, "update", effectiveUser, tenantId);
        if (!shouldSkipWriteSideEffects(options) && !options.skipReturning) {
          scheduleIndexNowPing(collectionId, postWriteDoc, tenantId);
          scheduleDefaultListWarm(schema._id as string, tenantId, effectiveUser, (warmOpts) =>
            this.find(collectionId, { tenantId: warmOpts.tenantId, user: warmOpts.user }),
          );
        }
      });
    }
    markWritePhase(options, "postwrite", tPost);

    return decryptedUpdate;
  }

  /**
   * Roll an entry back to a stored revision.
   *
   * The snapshot is replayed through {@link update}, so:
   * - the current row is validated against today's schema (a restore cannot write
   *   fields that no longer exist or bypass required-field rules);
   * - the *pre-restore* content is itself snapshotted as a new revision, which makes
   *   the restore undoable;
   * - `expectedVersion` is honoured, so a restore cannot clobber a concurrent edit.
   *
   * The content write is one statement (atomic). The history snapshot follows it and
   * is best-effort, exactly like every other revision-recording write.
   */
  async restoreRevision(
    collectionId: string,
    entryId: string,
    version: number,
    options: LocalApiOptions = {},
  ) {
    return restoreEntryRevision(this, collectionId, entryId, version, options);
  }

  private async recordRevision(
    entryId: string,
    previousData: any,
    user: any,
    tenantId: DatabaseId | null | undefined,
    revisionLimit: number = DEFAULT_REVISION_LIMIT,
    options?: RecordRevisionOptions,
  ): Promise<void> {
    return recordRevision(
      this._dbAdapter,
      entryId,
      previousData,
      user,
      tenantId,
      revisionLimit,
      options,
    );
  }

  async runAction(
    collectionId: string,
    action: string,
    entryId: string,
    input: unknown,
    options: { user?: any; tenantId?: DatabaseId | null; roles?: unknown } = {},
  ): Promise<{ success: boolean; data?: unknown }> {
    return runCollectionAction(this, collectionId, action, entryId, input, options);
  }

  async delete(
    collectionId: string,
    entryId: string,
    options: LocalApiOptions & { permanent?: boolean } = {},
  ) {
    return executeDelete(this, collectionId, entryId, options);
  }

  /**
   * Dry-run of `prepareWritePayload`. Nothing is written. Not used by the
   * request path — callers that want a preflight (imports, AI drafts) opt in.
   */
  async validate(
    collectionId: string,
    data: unknown,
    options: LocalApiOptions & { operation?: "create" | "update" } = {},
  ): Promise<{ valid: true } | { valid: false; message: string; code?: string }> {
    const { user, tenantId, system } = options;
    const schema = await this.schemaOf(collectionId, tenantId);
    const hot = ensureSchemaHotFlags(schema);
    try {
      let entryData = prepareWritePayload(data, schema, hot, {
        user,
        system,
        operation: options.operation ?? "create",
        tenantId,
      });
      if (isThenable(entryData)) entryData = await entryData;
      if (entryData === undefined) return { valid: false, message: "Empty payload" };
      return { valid: true };
    } catch (err) {
      if (err instanceof AppError) {
        return { valid: false, message: err.message, code: err.code };
      }
      throw err;
    }
  }
}
