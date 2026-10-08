/**
 * @file src/utils/security/permission-cache.ts
 * @description Permission evaluation caching for performance optimization
 *
 * ### Performance
 * - The sorted-role key segment is memoized per `roleIds` array identity in a
 *   WeakMap, mirroring `getRoleIdsArray` in `src/databases/auth/permissions.ts`
 *   (which reuses one array per source `Role[]`). Repeated calls with the same
 *   array instance skip the per-call spread/sort/join entirely. Both caches
 *   share the same contract: the roleIds array is treated as immutable.
 */

const PERMISSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;

interface CacheEntry {
  result: boolean;
  timestamp: number;
}

class PermissionCache {
  private cache = new Map<string, CacheEntry>();

  /** Sorted-role segment memoized per roleIds array identity (see header). */
  private sortedRoleIdsCache = new WeakMap<readonly string[], string>();

  private getSortedRoleIds(roleIds: string[]): string {
    const cached = this.sortedRoleIdsCache.get(roleIds);
    if (cached !== undefined) return cached;
    // Single-element / empty arrays are trivially sorted: no spread/sort/join
    // and no WeakMap entry (fresh instances recompute in O(1) anyway).
    const length = roleIds.length;
    if (length === 0) return "";
    if (length === 1) return roleIds[0] ?? "";
    const sorted = [...roleIds].sort().join(",");
    this.sortedRoleIdsCache.set(roleIds, sorted);
    return sorted;
  }

  private getKey(userId: string, permissionId: string, roleIds: string[]): string {
    return `${userId}:${permissionId}:${this.getSortedRoleIds(roleIds)}`;
  }

  get(userId: string, permissionId: string, roleIds: string[]): boolean | null {
    const key = this.getKey(userId, permissionId, roleIds);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.timestamp > PERMISSION_CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  set(userId: string, permissionId: string, roleIds: string[], result: boolean): void {
    // Evict oldest entries if cache is too large (LRU-like)
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const key = this.getKey(userId, permissionId, roleIds);
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  invalidateUser(userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  getStats() {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need tracking
      maxSize: MAX_CACHE_SIZE,
    };
  }
}

export const permissionCache = new PermissionCache();
