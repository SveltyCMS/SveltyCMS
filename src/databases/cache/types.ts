/**
 * @file src/databases/cache/types.ts
 * @description Cache types and interfaces
 */
import type { RedisClientType } from "redis";

// Re-export client-safe cache constants
import { CacheCategory } from "./cache-constants";
export { CacheCategory };
export type { CacheCategory as CacheCategoryType } from "./cache-constants";

export interface CacheStore {
  clearByPattern(pattern: string): Promise<void>;
  clearByTags(tags: string[]): Promise<void>;
  delete(key: string | string[]): Promise<void>;
  disconnect(): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  getClient(): RedisClientType | null;
  initialize(): Promise<void>;
  set<T>(key: string, value: T, ttlSeconds: number, tags?: string[]): Promise<void>;
}

export interface WarmCacheConfig {
  category?: CacheCategory;
  fetcher: () => Promise<unknown>;
  keys: string[];
  tenantId?: string | null;
}

export interface PrefetchPattern {
  category?: CacheCategory;
  fetcher?: (keys: string[]) => Promise<Record<string, unknown>>;
  pattern: RegExp;
  prefetchKeys: (matchedKey: string) => string[];
}
