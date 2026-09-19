/**
 * @file src/databases/core/count-cache.ts
 * @description
 * Short-lived tenant-scoped cache for crud.count — equal benefit on all engines.
 *
 * Misses still hit the adapter (exact/estimate); hits serve from L1 (and L2 if Redis).
 * Entries are tagged under every spelling `buildCollectionCacheTags` derives — the
 * name they were called with, the normalised physical table name
 * (`collectionTableName`), and the bare unprefixed spelling — so the write path
 * (post-write.ts) and adapter invalidators (BaseAdapter.invalidateQueryCache)
 * evict them whichever spelling they hold.
 *
 * ### Features:
 * - 30s TTL (CacheCategory.CONTENT tags)
 * - filter+mode hashed keys (stable serialization)
 * - bypassCache / skip when count fails
 * - superset tags (as-passed + normalised physical + bare spelling)
 * - Proxy wrap preserves class-based adapter methods
 */

import type {
  BaseEntity,
  CountOptions,
  DatabaseResult,
  ICrudAdapter,
  QueryFilter,
} from "../db-interface";
import { hashQueryPayload } from "@src/utils/collection-query-filters";
import { CacheCategory } from "../cache/types";
import { cacheService } from "../cache/cache-service";
import { buildCollectionCacheTags } from "./collection-name";

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

          const syncCached = cacheService.getSync<number>(key, tenantId);
          if (typeof syncCached === "number" && Number.isFinite(syncCached)) {
            return { success: true, data: syncCached };
          }

          const cached = await cacheService.get<number>(key, tenantId, CacheCategory.CONTENT);
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
                await cacheService.set(
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
