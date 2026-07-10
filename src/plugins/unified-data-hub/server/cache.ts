/**
 * @file src/plugins/unified-data-hub/server/cache.ts
 * @description TTL cache for virtual collection read results.
 *
 * Features:
 * - Tenant-scoped cache keys
 * - Tenant key index for O(1) clearTenantCache (v1.5 P4)
 * - Configurable TTL per connector
 * - LRU eviction with max entries
 */

import { LRUCache } from "lru-cache";
import type { VirtualReadResult } from "../types";

const cache = new LRUCache<string, { result: VirtualReadResult; expiresAt: number }>({
  max: 2000,
});

/** tenantId → set of cache keys for fast tenant eviction */
const tenantKeyIndex = new Map<string, Set<string>>();

function cacheKey(tenantId: string, collectionId: string, queryHash: string): string {
  return `udh:${tenantId}:${collectionId}:${queryHash}`;
}

function trackTenantKey(tenantId: string, key: string): void {
  let keys = tenantKeyIndex.get(tenantId);
  if (!keys) {
    keys = new Set();
    tenantKeyIndex.set(tenantId, keys);
  }
  keys.add(key);
}

function untrackTenantKey(tenantId: string, key: string): void {
  const keys = tenantKeyIndex.get(tenantId);
  if (!keys) return;
  keys.delete(key);
  if (keys.size === 0) tenantKeyIndex.delete(tenantId);
}

export function getCachedVirtualRead(
  tenantId: string,
  collectionId: string,
  queryHash: string,
): VirtualReadResult | null {
  const key = cacheKey(tenantId, collectionId, queryHash);
  const entry = cache.get(key);
  if (!entry) {
    recordCacheMiss();
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    untrackTenantKey(tenantId, key);
    recordCacheMiss();
    return null;
  }
  recordCacheHit();
  return {
    ...entry.result,
    meta: { ...entry.result.meta, staleness: "cache", cachedAt: entry.result.meta.cachedAt },
  };
}

export function setCachedVirtualRead(
  tenantId: string,
  collectionId: string,
  queryHash: string,
  result: VirtualReadResult,
  ttlSeconds: number,
): void {
  const key = cacheKey(tenantId, collectionId, queryHash);
  const cachedAt = new Date().toISOString();
  cache.set(key, {
    result: {
      ...result,
      meta: { ...result.meta, staleness: "cache", cachedAt },
    },
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  trackTenantKey(tenantId, key);
}

export function hashQuery(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

export function clearTenantCache(tenantId: string): void {
  const keys = tenantKeyIndex.get(tenantId);
  if (keys) {
    for (const key of keys) cache.delete(key);
    tenantKeyIndex.delete(tenantId);
    return;
  }
  // Fallback for entries created before index tracking
  for (const key of cache.keys()) {
    if (key.startsWith(`udh:${tenantId}:`)) cache.delete(key);
  }
}

export function getTenantCacheKeyCount(tenantId: string): number {
  return tenantKeyIndex.get(tenantId)?.size ?? 0;
}

let cacheHits = 0;
let cacheMisses = 0;

export function recordCacheHit(): void {
  cacheHits++;
}

export function recordCacheMiss(): void {
  cacheMisses++;
}

export function getCacheStats(): {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
  indexedTenants: number;
} {
  const total = cacheHits + cacheMisses;
  return {
    entries: cache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? cacheHits / total : 0,
    indexedTenants: tenantKeyIndex.size,
  };
}

/** Test-only: reset cache and index */
export function resetVirtualReadCache(): void {
  cache.clear();
  tenantKeyIndex.clear();
  cacheHits = 0;
  cacheMisses = 0;
}
