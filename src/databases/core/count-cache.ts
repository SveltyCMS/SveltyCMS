/**
 * @file src/databases/core/count-cache.ts
 * @description
 * Short-lived tenant-scoped cache for crud.count — equal benefit on all engines.
 *
 * Misses still hit the adapter (exact/estimate); hits serve from L1 (and L2 if Redis).
 * Invalidated with collection writes via BaseAdapter.invalidateQueryCache pattern
 * `count:{collection}:*`.
 *
 * ### Features:
 * - 30s TTL (CacheCategory.CONTENT tags)
 * - filter+mode hashed keys (stable serialization)
 * - bypassCache / skip when count fails
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

/** Short TTL so admin badges stay fresh without hammering COUNT. */
export const COUNT_CACHE_TTL_SECONDS = 30;

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

          const { cacheService } = await import("../cache/cache-service");
          const key = buildCountCacheKey(collection, query, options);
          const tenantId = options?.tenantId ?? null;

          const cached = await cacheService.get<number>(key, tenantId, CacheCategory.CONTENT);
          // get() returns undefined on miss, null on negative cache — only numbers are hits
          if (typeof cached === "number" && Number.isFinite(cached)) {
            return { success: true, data: cached };
          }

          const result = await target.count(collection, query, options);
          if (result.success && typeof result.data === "number") {
            await cacheService.set(
              key,
              result.data,
              COUNT_CACHE_TTL_SECONDS,
              tenantId,
              CacheCategory.CONTENT,
              [`count`, `count:${collection}`, `collection:${collection}`],
            );
          }
          return result;
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
