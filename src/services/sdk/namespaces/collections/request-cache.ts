/**
 * @file src/services/sdk/namespaces/collections/request-cache.ts
 * @description
 * Module-level L1 request cache (bounded LRU) + keyspace index for the
 * collections namespace.
 *
 * List-query keys only (low cardinality) join the keyspace index for scoped
 * eviction. Per-entry findById keys are high-cardinality — indexing them and
 * running a string-split dispose on every LRU eviction tanked findByIdRandom
 * (10k distinct IDs vs max 2000). Write invalidation instead scans the
 * bounded LRU (≤2000 entries), which is cheap compared to read-path thrash.
 *
 * ### Features:
 * - 2000-entry / 60s L1 LRU shared by all collections namespaces
 * - keyspace index for O(1) scoped eviction of list keys
 * - entry-key eviction via bounded LRU scan
 */

import { LRUCache } from "lru-cache";
import type { DatabaseId } from "@src/databases/db-interface";

const _requestCache = new LRUCache<string, any>({
  max: 2000,
  ttl: 60_000,
});

const _requestCacheKeys = new Map<string, Set<string>>();

/** True when this key is a list/query key worth indexing for scoped eviction. */
export function isListCacheKey(key: string): boolean {
  return key.includes(":find:");
}

/** Set entry. Only list keys join the keyspace index (no dispose hook). */
export function setRequestCache(
  key: string,
  value: any,
  collectionId?: string,
  tenantId?: DatabaseId | null,
): void {
  _requestCache.set(key, value);
  if (collectionId && isListCacheKey(key)) {
    const prefix = `${tenantId || "global"}:${collectionId}`;
    let set = _requestCacheKeys.get(prefix);
    if (!set) {
      set = new Set<string>();
      _requestCacheKeys.set(prefix, set);
    }
    set.add(key);
  }
}

/** Scoped LRU eviction for a specific collection keyspace. */
export function evictRequestCache(collectionId?: string, tenantId?: string): void {
  if (!collectionId) {
    _requestCache.clear();
    _requestCacheKeys.clear();
    return;
  }
  const prefix = `${tenantId || "global"}:${collectionId}`;
  const keys = _requestCacheKeys.get(prefix);
  if (keys) {
    for (const key of keys) {
      _requestCache.delete(key);
    }
    _requestCacheKeys.delete(prefix);
  }
  // Entry keys (findById) are not indexed — scan the bounded LRU.
  const token = `collection:${collectionId}`;
  const tenantPrefix = tenantId ? `${tenantId}:` : null;
  for (const key of _requestCache.keys()) {
    if (!key.includes(token)) continue;
    if (tenantPrefix && !key.startsWith(tenantPrefix) && !key.startsWith("global:")) continue;
    _requestCache.delete(key);
  }
}

/** Synchronous presence check for the L1 request cache. */
export function hasRequestCache(key: string): boolean {
  return _requestCache.has(key);
}

/** Synchronous read from the L1 request cache. */
export function getRequestCache<T = any>(key: string): T | undefined {
  return _requestCache.get(key);
}
