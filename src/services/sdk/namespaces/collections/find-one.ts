/**
 * @file src/services/sdk/namespaces/collections/find-one.ts
 * @description
 * Single-entry read path for `CollectionsNamespace`: `findById` (cache gates,
 * publication clamp, relation warm-up) and the `loadOneById` point-read.
 * Extracted verbatim from the namespace with the adapter/schema access passed
 * as an explicit context.
 *
 * ### Features:
 * - canonical lowercased schema cache key + warm hot-flag freeze
 * - L1 request-cache, sync L2 and negative-404 gates before the adapter
 * - direct `crud.findById` point read with publication clamping
 * - widget `modifyRequest` on the loaded row and `_collection` meta stamping
 * - ENTRY-category cache write tagged by `doc:{collection}:{id}` (or a miss),
 *   plus the deferred relation warm-up for privileged callers
 */

import {
  isPublishedStatus,
  publicationCacheSuffix,
  resolvePublicationFilter,
} from "@utils/security/publication-policy";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import type { BaseEntity, DatabaseId, IDBAdapter, QueryFilter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";
import type { LocalApiOptions } from "../types";
import { scheduleRelationWarmup } from "../populate-resolver";
import { ensureSchemaHotFlags, peekReadySchema, widgetNamesOf } from "./schema-store";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { getRequestCache, setRequestCache } from "./request-cache";
import { applyWidgetPipeline } from "./write-pipeline";
import { presentRead, readEncryptionContext } from "./read-pipeline";
import { hydrateJunctionFields, junctionFieldsOf } from "./junction-fields";

/** What the point-read lane needs from the namespace — no class instance required. */
export interface FindOneContext {
  _dbAdapter: IDBAdapter;
  getSchema(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema>;
  schemaOf(collectionId: string, tenantId?: DatabaseId | null): Promise<Schema>;
  getCollectionName(schemaId: string): string;
}

/** `loadOneById` options — the facade options plus the publication suffix handed down by `findById`. */
export type LoadOneOptions = LocalApiOptions & {
  effectivePublicationFilter?: "published" | "draft" | "all";
  ttl?: number;
};

/**
 * Single-id hot path — findOne + optional widget pipeline (no microtask batch delay).
 */
async function loadOneById(
  ctx: FindOneContext,
  schema: Schema,
  entryId: string,
  options: LoadOneOptions,
  cacheKey?: string,
) {
  const { tenantId, ttl, bypassCache } = options;
  const collectionName = ctx.getCollectionName(schema._id as string);
  // Content rows are written under the canonical `"global"` tenant (SQL) or
  // `null` (Mongo) when tenancy is off, while the adapter's `tenantId: null`
  // pins SQL filters to `IS NULL` and Mongo to `tenantId: null` (correct for
  // auth/settings rows, wrong for content). A missing tenant is the unscoped
  // read that matches content rows on both families — passing `"global"`
  // still added a Mongo tenant filter and missed rows stored with `null`.
  const adapterTenant = (tenantId || undefined) as DatabaseId | undefined;
  const effectivePublicationFilter =
    options.effectivePublicationFilter ||
    resolvePublicationFilter(
      { user: options.user, system: options.system },
      options.publicationFilter,
    );
  // 🚀 DIRECT DB CALL: Direct findById bypasses findOne -> parseIdLookup overhead.
  // Publication clamping is applied to the retrieved item so unpublished rows never
  // escape to clamped callers (and empty result is cached under the publication suffix).
  const crud = ctx._dbAdapter.crud;
  const result =
    typeof crud.findById === "function"
      ? await crud.findById<BaseEntity & Record<string, unknown>>(
          collectionName,
          entryId as DatabaseId,
          {
            tenantId: adapterTenant,
            skipMeta: true,
          },
        )
      : await crud.findOne<BaseEntity & Record<string, unknown>>(
          collectionName,
          { _id: entryId } as QueryFilter<BaseEntity & Record<string, unknown>>,
          {
            tenantId: adapterTenant,
            skipMeta: true,
          },
        );

  let item: Record<string, unknown> | null =
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
        dbAdapter: ctx._dbAdapter,
        user: options.user || { _id: "system", role: "admin" },
        type: "GET",
        tenantId,
        collectionName: schema.name,
        skipValidation: options.skipValidation,
        action: "findById",
      });
      item = payload[0] ?? item;
    }

    // 🔗 Hydrate junction (many-to-many) fields before caching/presenting.
    if (junctionFieldsOf(schema).length > 0) {
      await hydrateJunctionFields(ctx._dbAdapter, schema, [item], tenantId);
    }

    item._collection = (schema as { _collectionMeta?: unknown })._collectionMeta || {
      id: schema._id,
      name: schema.name,
      label: schema.label,
    };
    (schema as { _collectionMeta?: unknown })._collectionMeta = item._collection;
  }

  const finalResult = { success: true, data: item || null };
  const resolvedCacheKey =
    cacheKey ??
    `${tenantId || "global"}:collection:${schema._id}:${entryId}${publicationCacheSuffix(effectivePublicationFilter)}`;

  if (!bypassCache && !options.skipCacheService) {
    // The HTTP lane already stores the response body. A second copy of every
    // random id in this LRU is insert+evict work the next GET never reads:
    // the lane returns from the response cache before findById runs again.
    setRequestCache(resolvedCacheKey, finalResult, schema._id as string, tenantId);
    if (item) {
      // Point-read lanes that already cache the full HTTP response opt out of
      // the second entry: cacheService.set also writes the key prefix map, the
      // doc tag index and an L2 serialization, all of which a random per-id
      // scan pays for rows it will never read twice.
      if (!options.skipCacheService) {
        cacheService
          .set(
            resolvedCacheKey,
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
    } else if (result.success && !options.system && options.disableErrors !== true) {
      // Only a successful query can prove absence — a transient adapter error
      // must never poison the negative cache. The doc tag lets the next write
      // to this id clear the marker immediately (clearByTags → invalidateByTags).
      cacheService.recordMiss(resolvedCacheKey, (tenantId || undefined) as string, [
        `doc:${schema._id}:${entryId}`,
      ]);
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

/**
 * Find one entry by id.
 *
 * Gates run in the original order: request cache → sync L2 → negative 404 →
 * adapter point read. A cached hit and the adapter path both go through
 * `presentRead`, and the deferred relation warm-up keeps the same policy.
 */
export async function executeFindById(
  ctx: FindOneContext,
  collectionId: string,
  entryId: string,
  options: LocalApiOptions = {},
) {
  const { tenantId, bypassCache = false, disableErrors = false } = options;
  // Canonical lowercase schema cache key — the legacy `${tenant}:${collectionId}`
  // (no lowercase) always missed getSchema's lowercased key, guaranteeing a
  // duplicate entry + wasted resolution on every findById.
  const schema =
    peekReadySchema(tenantId, collectionId) ||
    (await ctx.getSchema(collectionId, tenantId).catch((err) => {
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

  // Warm the declared relations of a detail row for privileged callers. The
  // entry editor opens relation pickers separately, so warming here makes the
  // first open an L1 hit. `scheduleRelationWarmup` is deferred, capped and
  // no-op for unprivileged callers; it never alters `data`.
  const warmRelations = (result: { data?: unknown } | null | undefined): void => {
    if (options.populate && options.populate.length > 0) return;
    const row = result?.data;
    if (!row || typeof row !== "object") return;
    scheduleRelationWarmup(
      [row],
      schema,
      tenantId || undefined,
      ctx._dbAdapter,
      (id) => ctx.getCollectionName(id),
      {
        user: options.user,
        system: options.system,
        requestedPublicationFilter: effectivePublicationFilter,
        resolveTargetSchema: (id: string) => ctx.schemaOf(id, tenantId),
      },
    );
  };

  // The request cache for this key is only ever populated by a caller that did NOT
  // pass `skipCacheService` (see `loadOneById`), so probing it on behalf of such a
  // caller is dead work on the cold point-read path.
  if (!skipRequestCache && !options.skipCacheService) {
    const cachedEntry = getRequestCache(cacheKey);
    if (cachedEntry !== undefined) {
      const hot = ensureSchemaHotFlags(schema);
      const result = presentRead(
        cachedEntry,
        schema,
        hot,
        readEncryptionContext(schema, tenantId, hot),
        options.user,
        options.system,
      );
      warmRelations(result);
      return result;
    }
  }

  // 🚀 SYNC L1 HIT: Use synchronous L1 check instead of async L2 get.
  // For findByIdRandom (10K distinct IDs), the async cacheService.get() costs
  // ~5µs per miss just in microtask overhead — getSync eliminates that.
  // Callers that opted out of the shared cache (skipCacheService — the HTTP
  // read lane) never wrote this key, so the probe is a guaranteed miss.
  if (!bypassCache && !options.skipCacheService) {
    const syncCached = cacheService.getSync?.<unknown>(cacheKey, (tenantId || undefined) as string);
    if (syncCached !== undefined && syncCached !== null) {
      setRequestCache(cacheKey, syncCached, schema._id as string, tenantId);
      const hot = ensureSchemaHotFlags(schema);
      const result = presentRead(
        syncCached,
        schema,
        hot,
        readEncryptionContext(schema, tenantId, hot),
        options.user,
        options.system,
      );
      warmRelations(result);
      return result;
    }
  }

  // Negative 404: a confirmed miss under this exact publication suffix skips
  // the adapter. Excluded for system scope and `disableErrors` callers, which
  // use a miss as an existence probe (singleton / create checks).
  if (
    !bypassCache &&
    !options.skipCacheService &&
    !options.system &&
    !disableErrors &&
    cacheService.isNegativeHit(cacheKey, (tenantId || undefined) as string)
  ) {
    const hot = ensureSchemaHotFlags(schema);
    return presentRead(
      { success: true, data: null },
      schema,
      hot,
      readEncryptionContext(schema, tenantId, hot),
      options.user,
      options.system,
    );
  }

  // Single-id hot path: direct loadOneById (no microtask batch delay). The
  // cache key built above is threaded through so the point-read lane does not
  // rebuild the same string and does not copy the options object.
  const result = await loadOneById(ctx, schema, entryId, options, cacheKey);
  warmRelations(result);
  return result;
}

// Point-read pipeline module. `CollectionsNamespace.findById` owns the gates
// (schema, permissions, request cache); this module owns the load and shaping.
