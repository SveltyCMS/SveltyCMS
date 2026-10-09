/**
 * @file src/databases/core/cache-module.ts
 * @description Optimized, multi-tenant aware cache orchestration and short-lived count caching.
 *
 * Features:
 * - Atomic version increment (cacheService.increment when available)
 * - Consistent tenant isolation across all CRUD methods
 * - Lazy-loaded cache service (single async resolution)
 * - 30s TTL tenant-scoped count cache proxy (`createCountCachedCrud`)
 * - Single-flight deduplication of concurrent count queries
 * - Superset collection tags for eviction parity across spelling forms
 */

import type {
  BaseEntity,
  BaseQueryOptions,
  CacheOptions,
  CountOptions,
  DatabaseResult,
  ICrudAdapter,
  ISqlAdapter,
  QueryFilter,
} from "../db-interface";
import { buildCollectionCacheTags } from "./collection-name";
import { hashQueryPayload } from "@src/utils/collection-query-filters";
import { CacheCategory } from "../cache/types";

/** Cached lazy handle to the cache service — one module-registry lookup instead of one per call. */
let cacheServiceModulePromise:
  | Promise<typeof import("@src/databases/cache/cache-service")>
  | undefined;
function loadCacheServiceModule(): Promise<typeof import("@src/databases/cache/cache-service")> {
  return (cacheServiceModulePromise ??= import("@src/databases/cache/cache-service"));
}

let _cacheServiceCache: any = null;

async function getCacheService(): Promise<any> {
  if (!_cacheServiceCache) {
    const module = await loadCacheServiceModule();
    _cacheServiceCache = module.cacheService;
  }
  return _cacheServiceCache;
}

export class CacheModule {
  constructor(protected _core: ISqlAdapter) {}

  async get<T>(key: string, tenantId?: string | null): Promise<DatabaseResult<T | null>> {
    const cacheService = await getCacheService();
    const data = (await cacheService.get(key, tenantId ?? undefined)) as T;
    return { success: true, data: data ?? null };
  }

  async set<T>(
    key: string,
    value: T,
    options?: CacheOptions & { tenantId?: string | null },
  ): Promise<DatabaseResult<void>> {
    const cacheService = await getCacheService();
    const tenant = options?.tenantId ?? undefined;

    await cacheService.set(key, value, options?.ttl || 0, tenant, (options as any)?.category);
    return { success: true, data: undefined };
  }

  async delete(key: string, tenantId?: string | null): Promise<DatabaseResult<void>> {
    const cacheService = await getCacheService();
    await cacheService.delete(key, tenantId ?? undefined);
    return { success: true, data: undefined };
  }

  async clear(tags?: string[], tenantId?: string | null): Promise<DatabaseResult<void>> {
    const cacheService = await getCacheService();
    const tenant = tenantId ?? undefined;

    if (tags && tags.length > 0) {
      await cacheService.clearByTags(tags, tenant);
    } else {
      await cacheService.invalidateAll(tenant);
    }
    return { success: true, data: undefined };
  }

  async invalidateCollection(
    collection: string,
    optionsOrTenantId?: string | null | BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    const tenantId =
      typeof optionsOrTenantId === "object" && optionsOrTenantId !== null
        ? optionsOrTenantId.tenantId
        : optionsOrTenantId;
    const cacheService = await getCacheService();
    // Schema id + normalised physical name — see buildCollectionCacheTags.
    await cacheService.clearByTags(buildCollectionCacheTags(collection), tenantId ?? undefined);
    await this.incrementVersion(tenantId);
    return { success: true, data: undefined };
  }

  async invalidateCategory(
    category: string,
    optionsOrTenantId?: string | null | BaseQueryOptions,
  ): Promise<DatabaseResult<void>> {
    const tenantId =
      typeof optionsOrTenantId === "object" && optionsOrTenantId !== null
        ? optionsOrTenantId.tenantId
        : optionsOrTenantId;
    const cacheService = await getCacheService();
    await cacheService.clearByTags([`category:${category}`], tenantId ?? undefined);
    await this.incrementVersion(tenantId);
    return { success: true, data: undefined };
  }

  async getVersion(
    optionsOrTenantId?: string | null | BaseQueryOptions,
  ): Promise<DatabaseResult<number>> {
    const tenantId =
      typeof optionsOrTenantId === "object" && optionsOrTenantId !== null
        ? optionsOrTenantId.tenantId
        : optionsOrTenantId;
    const cacheService = await getCacheService();
    const version = await cacheService.get(`system:content_version`, tenantId ?? undefined);
    return { success: true, data: (version as number) ?? 0 };
  }

  /**
   * Thread-safe atomic version increment to prevent stale content delivery.
   * Uses native cacheService.increment if available, falls back to RMW.
   */
  async incrementVersion(
    optionsOrTenantId?: string | null | BaseQueryOptions,
  ): Promise<DatabaseResult<number>> {
    const tenantId =
      typeof optionsOrTenantId === "object" && optionsOrTenantId !== null
        ? optionsOrTenantId.tenantId
        : optionsOrTenantId;
    const cacheService = await getCacheService();
    const key = `system:content_version`;
    const tenant = tenantId ?? undefined;

    let next: number;

    if (typeof cacheService.increment === "function") {
      next = await cacheService.increment(key, 1, tenant);
    } else {
      const current = ((await cacheService.get(key, tenant)) as number) || 0;
      next = current + 1;
      await cacheService.set(key, next, 0, tenant);
    }

    return { success: true, data: next };
  }
}

// ---------------------------------------------------------------------------
// Short-Lived Count Cache Proxy & Utilities
// ---------------------------------------------------------------------------

/** Short TTL so admin badges stay fresh without hammering COUNT. */
export const COUNT_CACHE_TTL_SECONDS = 30;

/**
 * Tags a count entry is registered under: the bare `count` bucket plus every
 * `collection:`/`count:` tag for the collection spellings (shared derivation in
 * collection-name.ts). The write path must evict the entry without knowing
 * which spelling was used.
 */
export function buildCountCacheTags(collection: string): string[] {
  return ["count", ...buildCollectionCacheTags(collection)];
}

export function buildCountCacheKey(
  collection: string,
  query: QueryFilter<any> | undefined,
  options?: CountOptions,
): string {
  const mode = options?.mode ?? "auto";
  const includeDeleted = options?.includeDeleted ? "1" : "0";
  const filterHash = hashQueryPayload(query ?? {});
  return `count:${collection}:${mode}:${includeDeleted}:${filterHash}`;
}

const inFlightCounts = new Map<string, Promise<DatabaseResult<number>>>();

/**
 * Wrap an ICrudAdapter so count() is L1/L2 cached per tenant+filter+mode.
 * Other methods (including findPage) pass through bound to the inner adapter.
 */
export function createCountCachedCrud(inner: ICrudAdapter): ICrudAdapter {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "count") {
        return async <T extends BaseEntity>(
          collection: string,
          query?: QueryFilter<T>,
          options?: CountOptions,
        ): Promise<DatabaseResult<number>> => {
          if (options?.bypassCache) {
            return target.count(collection, query, options);
          }

          const key = buildCountCacheKey(collection, query, options);
          const tenantId = options?.tenantId ?? null;

          const cacheSvc = await getCacheService();
          const syncCached = cacheSvc.getSync?.(key, tenantId);
          if (typeof syncCached === "number" && Number.isFinite(syncCached)) {
            return { success: true, data: syncCached };
          }

          const cached = await cacheSvc.get(key, tenantId, CacheCategory.CONTENT);
          // get() returns undefined on miss, null on negative cache — only numbers are hits
          if (typeof cached === "number" && Number.isFinite(cached)) {
            return { success: true, data: cached };
          }

          // Single-flight deduplication: coalesce identical in-flight COUNT queries
          const inFlightKey = `${tenantId || "default"}:${key}`;
          const existing = inFlightCounts.get(inFlightKey);
          if (existing) return existing;

          const execute = (async () => {
            try {
              const result = await target.count(collection, query, options);
              if (result.success && typeof result.data === "number") {
                await cacheSvc.set(
                  key,
                  result.data,
                  COUNT_CACHE_TTL_SECONDS,
                  tenantId,
                  CacheCategory.CONTENT,
                  buildCountCacheTags(collection),
                );
              }
              return result;
            } finally {
              inFlightCounts.delete(inFlightKey);
            }
          })();

          inFlightCounts.set(inFlightKey, execute);
          return execute;
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  }) as ICrudAdapter;
}
