/**
 * @file src/databases/mariadb/performance/cache-module.ts
 * @description In-memory cache module for MariaDB adapter
 */

import type { CacheOptions, DatabaseResult } from "../../db-interface";

export class CacheModule {
  private readonly cache: Map<string, { value: unknown; expiresAt?: number }> = new Map();

  async get<T>(key: string): Promise<DatabaseResult<T | null>> {
    const entry = this.cache.get(key);
    if (!entry) {
      return { success: true, data: null };
    }
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return { success: true, data: null };
    }
    return { success: true, data: entry.value as T };
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<DatabaseResult<void>> {
    const expiresAt = options?.ttl ? Date.now() + options.ttl * 1000 : undefined;
    this.cache.set(key, { value, expiresAt });
    return { success: true, data: undefined };
  }

  async delete(key: string): Promise<DatabaseResult<void>> {
    this.cache.delete(key);
    return { success: true, data: undefined };
  }

  async clear(tags?: string[]): Promise<DatabaseResult<void>> {
    if (tags && tags.length > 0) {
      for (const [key] of this.cache) {
        if (tags.some((tag) => key.includes(tag))) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
    return { success: true, data: undefined };
  }

  async invalidateCollection(
    collection: string,
    _tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    for (const [key] of this.cache) {
      if (key.includes(collection)) {
        this.cache.delete(key);
      }
    }
    return { success: true, data: undefined };
  }

  async invalidateCategory(
    category: string,
    _tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    for (const [key] of this.cache) {
      if (key.includes(category)) {
        this.cache.delete(key);
      }
    }
    return { success: true, data: undefined };
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
