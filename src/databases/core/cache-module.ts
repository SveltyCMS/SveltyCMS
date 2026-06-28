/**
 * @file src/databases/core/cache-module.ts
 * @description Optimized, multi-tenant aware cache orchestration module for SQLite.
 *
 * Features:
 * - Atomic version increment (cacheService.increment when available)
 * - Consistent tenant isolation across all CRUD methods
 * - Lazy-loaded cache service (single async resolution)
 */

import type { DatabaseResult, CacheOptions, ISqlAdapter } from "../db-interface";

let _cacheServiceCache: any = null;

async function getCacheService(): Promise<any> {
  if (!_cacheServiceCache) {
    const module = await import("@src/databases/cache/cache-service");
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
    tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    const cacheService = await getCacheService();
    await cacheService.clearByTags([`collection:${collection}`], tenantId ?? undefined);
    await this.incrementVersion(tenantId);
    return { success: true, data: undefined };
  }

  async invalidateCategory(
    category: string,
    tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    const cacheService = await getCacheService();
    await cacheService.clearByTags([`category:${category}`], tenantId ?? undefined);
    await this.incrementVersion(tenantId);
    return { success: true, data: undefined };
  }

  async getVersion(tenantId?: string | null): Promise<DatabaseResult<number>> {
    const cacheService = await getCacheService();
    const version = await cacheService.get(`system:content_version`, tenantId ?? undefined);
    return { success: true, data: (version as number) ?? 0 };
  }

  /**
   * Thread-safe atomic version increment to prevent stale content delivery.
   * Uses native cacheService.increment if available, falls back to RMW.
   */
  async incrementVersion(tenantId?: string | null): Promise<DatabaseResult<number>> {
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
