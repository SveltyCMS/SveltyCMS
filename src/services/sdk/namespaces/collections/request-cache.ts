/**
 * @file src/services/sdk/namespaces/collections/request-cache.ts
 * @description
 * Module-level L1 request cache (bounded LRU) + keyspace index for the
 * collections namespace.
 *
 * List-query keys (low cardinality) join the keyspace index for scoped
 * eviction. Per-entry findById keys are high-cardinality — indexing them and
 * running a string-split dispose on every LRU eviction tanked findByIdRandom
 * (10k distinct IDs vs max 2000). Per-entry invalidation therefore uses an
 * O(1) generation counter per collection instead of a bounded-LRU scan: a write
 * bumps the collection epoch, and stale entries are lazily skipped on read and
 * recycled by TTL/LRU (never a scan).
 *
 * ### Features:
 * - 2000-entry / 60s L1 LRU shared by all collections namespaces
 * - keyspace index for O(1) scoped eviction of list keys
 * - generation counter for O(1) per-id eviction on write
 */

import { LRUCache } from "lru-cache";
import type { DatabaseId } from "@src/databases/db-interface";

interface CacheEntry {
  value: any;
  /** Collection epoch key — null for unscoped/system entries (never write-invalidated). */
  ck: string | null;
  epoch: number;
}

const _requestCache = new LRUCache<string, CacheEntry>({
  max: 2000,
  ttl: 60_000,
});

const _requestCacheKeys = new Map<string, Set<string>>();

/** Collection → generation epoch. Bounded by the number of collections ever written. */
const _collectionEpochs = new Map<string, number>();

function collectionEpochKey(collectionId: string, tenantId?: unknown): string {
  return `${String(tenantId || "global")}:${collectionId}`;
}

function isStale(entry: CacheEntry): boolean {
  if (!entry.ck) return false;
  return entry.epoch !== (_collectionEpochs.get(entry.ck) ?? 0);
}

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
  const ck = collectionId ? collectionEpochKey(collectionId, tenantId) : null;
  const epoch = ck ? (_collectionEpochs.get(ck) ?? 0) : 0;
  _requestCache.set(key, { value, ck, epoch });
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

/** Scoped invalidation for a collection keyspace. O(#list keys + 1) — no LRU scan. */
export function evictRequestCache(collectionId?: string, tenantId?: string): void {
  if (!collectionId) {
    _requestCache.clear();
    _requestCacheKeys.clear();
    _collectionEpochs.clear();
    return;
  }

  const prefix = `${tenantId || "global"}:${collectionId}`;

  // List keys: explicit scoped eviction (low cardinality — frees LRU memory now).
  const keys = _requestCacheKeys.get(prefix);
  if (keys) {
    for (const key of keys) {
      _requestCache.delete(key);
    }
    _requestCacheKeys.delete(prefix);
  }

  // Per-id keys: bump the generation so every cached entry for this collection
  // is logically invalidated in O(1). Stale entries are skipped on read and
  // reclaimed by TTL/LRU — never a full LRU scan.
  const ck = collectionEpochKey(collectionId, tenantId);
  _collectionEpochs.set(ck, (_collectionEpochs.get(ck) ?? 0) + 1);
}

/** Synchronous presence check for the L1 request cache (epoch-aware). */
export function hasRequestCache(key: string): boolean {
  const entry = _requestCache.get(key);
  if (!entry || isStale(entry)) return false;
  return true;
}

/** Synchronous read from the L1 request cache (epoch-aware). */
export function getRequestCache<T = any>(key: string): T | undefined {
  const entry = _requestCache.get(key);
  if (!entry || isStale(entry)) return undefined;
  return entry.value;
}
