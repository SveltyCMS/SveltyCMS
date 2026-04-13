/**
 * @file src/databases/cache/types.ts
 * @description Type definitions for the SveltyCMS caching system.
 */

export enum CacheCategory {
  API = "api",
  AUTH = "auth",
  COLLECTION = "collection",
  CONTENT = "content",
  GENERAL = "general",
  MEDIA = "media",
  SCHEMA = "schema",
  SESSION = "session",
  SYSTEM = "system",
  THEME = "theme",
  USER = "user",
  WIDGET = "widget",
}

export interface CacheOptions {
  category?: CacheCategory;
  tags?: string[];
  ttl?: number;
}

export interface CacheStats {
  evictions: number;
  hits: number;
  l1Hits: number;
  l2Hits: number;
  misses: number;
  l1Size: number;
  size: number;
  deletes: number;
}

export interface CacheEntry<T = any> {
  category: CacheCategory;
  createdAt: number;
  data: T;
  expiresAt: number;
  tags: string[];
}

export interface CacheStore {
  initialize(): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void>;
  delete(key: string | string[]): Promise<void>;
  clearByPattern(pattern: string): Promise<void>;
  clearByTags(tags: string[]): Promise<void>;
  disconnect(): Promise<void>;
  getClient(): any | null;
}
