/**
 * @file src/databases/postgresql/performance/cache-module.ts
 * @description Cache management module for PostgreSQL
 */

import type { DatabaseResult } from "../../db-interface";
import type { AdapterCore } from "../adapter/adapter-core";

export class CacheModule {
  private readonly core: AdapterCore;
  private readonly _cache = new Map<string, { value: unknown; expires?: number }>();

  constructor(core: AdapterCore) {
    this.core = core;
  }

  async get<T>(key: string): Promise<DatabaseResult<T | null>> {
    return this.core.wrap(async () => {
      const entry = this._cache.get(key);
      if (!entry) {
        return null;
      }
      if (entry.expires && entry.expires < Date.now()) {
        this._cache.delete(key);
        return null;
      }
      return entry.value as T;
    }, "CACHE_GET_FAILED");
  }

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      this._cache.set(key, {
        value,
        expires: options?.ttl ? Date.now() + options.ttl * 1000 : undefined,
      });
    }, "CACHE_SET_FAILED");
  }

  async delete(key: string): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      this._cache.delete(key);
    }, "CACHE_DELETE_FAILED");
  }

  async clear(tags?: string[]): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      if (tags && tags.length > 0) {
        for (const [key] of this._cache) {
          if (tags.some((tag) => key.includes(tag))) {
            this._cache.delete(key);
          }
        }
      } else {
        this._cache.clear();
      }
    }, "CACHE_CLEAR_FAILED");
  }

  async invalidateCollection(
    collection: string,
    _tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      for (const key of this._cache.keys()) {
        if (key.includes(collection)) {
          this._cache.delete(key);
        }
      }
    }, "CACHE_INVALIDATE_COLLECTION_FAILED");
  }

  async invalidateCategory(
    category: string,
    _tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      for (const key of this._cache.keys()) {
        if (key.includes(category)) {
          this._cache.delete(key);
        }
      }
    }, "CACHE_INVALIDATE_CATEGORY_FAILED");
  }

  async getVersion(tenantId?: string | null): Promise<DatabaseResult<number>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    const version = await cacheService.get<number>(`system:content_version`, tenantId);
    return { success: true, data: version || 0 };
  }

  async incrementVersion(tenantId?: string | null): Promise<DatabaseResult<number>> {
    const { cacheService } = await import("@src/databases/cache/cache-service");
    const key = `system:content_version`;
    const current = (await cacheService.get<number>(key, tenantId)) || 0;
    const next = current + 1;
    await cacheService.set(key, next, 0, tenantId);
    return { success: true, data: next };
  }
}
