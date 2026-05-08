/**
 * @file src/databases/sqlite/performance/cache-module.ts
 * @description Cache module for SQLite
 *
 * Features:
 * - Get cache
 * - Set cache
 * - Delete cache
 * - Clear cache
 * - Invalidate collection
 * - Invalidate category
 */

import type { CacheOptions, DatabaseResult } from "../db-interface";
import type { AdapterCore } from "./adapter-core";

export class CacheModule {
  constructor(_core: AdapterCore) {}

  async get<T>(key: string): Promise<DatabaseResult<T | null>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    // We default to null tenant if not specified in key context, or assume key already includes it
    const data = await cacheService.get<T>(key);
    return { success: true, data: data ?? null };
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<DatabaseResult<void>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    // Extract tenantId and category from options if available in your system,
    // or pass through to service which handles TTL.
    await cacheService.set(key, value, options?.ttl || 0, undefined, (options as any)?.category);
    return { success: true, data: undefined };
  }

  async delete(key: string): Promise<DatabaseResult<void>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    await cacheService.delete(key);
    return { success: true, data: undefined };
  }

  async clear(tags?: string[]): Promise<DatabaseResult<void>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    if (tags && tags.length > 0) {
      await cacheService.clearByTags(tags);
    } else {
      await cacheService.invalidateAll();
    }
    return { success: true, data: undefined };
  }

  async invalidateCollection(
    collection: string,
    tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    await cacheService.clearByTags([`collection:${collection}`], tenantId);
    await this.incrementVersion(tenantId);
    return { success: true, data: undefined };
  }

  async invalidateCategory(
    category: string,
    tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    // Clear all entries belonging to a specific category by tag
    await cacheService.clearByTags([`category:${category}`], tenantId);
    await this.incrementVersion(tenantId);
    return { success: true, data: undefined };
  }

  async getVersion(tenantId?: string | null): Promise<DatabaseResult<number>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    const version = await cacheService.get(`system:content_version`, tenantId);
    return { success: true, data: (version as number) ?? 0 };
  }

  async incrementVersion(tenantId?: string | null): Promise<DatabaseResult<number>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    const key = `system:content_version`;
    const current = ((await cacheService.get(key, tenantId)) as number) || 0;
    const next = current + 1;
    await cacheService.set(key, next, 0, tenantId);
    return { success: true, data: next };
  }
}
