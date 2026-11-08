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
 * - Multi-tenant isolation is enforced via the `${tenantId || "global"}:${userId}:${permission}` key structure.
 * - Backed by FastLRU to prevent unbounded memory growth and eliminate garbage collector churn.
 */

import { FastLRU } from "@utils/native-utils";

const PERMISSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;

class PermissionCache {
  private cache = new FastLRU<string, boolean>({
    max: MAX_CACHE_SIZE,
    ttl: PERMISSION_CACHE_TTL,
  });

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

  private getKey(
    userId: string,
    permissionId: string,
    roleIds: string[],
    tenantId?: string | null,
  ): string {
    const tid = tenantId || "global";
    return `${tid}:${userId}:${permissionId}:${this.getSortedRoleIds(roleIds)}`;
  }

  get(
    userId: string,
    permissionId: string,
    roleIds: string[],
    tenantId?: string | null,
  ): boolean | null {
    const key = this.getKey(userId, permissionId, roleIds, tenantId);
    const result = this.cache.get(key);
    return result !== undefined ? result : null;
  }

  set(
    userId: string,
    permissionId: string,
    roleIds: string[],
    result: boolean,
    tenantId?: string | null,
  ): void {
    const key = this.getKey(userId, permissionId, roleIds, tenantId);
    this.cache.set(key, result);
  }

  invalidateUser(userId: string, tenantId?: string | null): void {
    const prefix = tenantId !== undefined ? `${tenantId || "global"}:${userId}:` : null;
    const userSearch = `:${userId}:`;

    for (const key of this.cache.keys()) {
      if (prefix) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      } else {
        // Unscoped invalidation: match user across all tenants
        const firstColon = key.indexOf(":");
        if (firstColon !== -1 && key.startsWith(userSearch, firstColon)) {
          this.cache.delete(key);
        }
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
