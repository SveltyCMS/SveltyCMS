/**
 * @file src/databases/cache/types.ts
 * @description Client-safe cache types and metrics interfaces.
 *
 * The cache engine itself lives in cache-service.ts (L1 LRU + L2 Redis with
 * pipelining, stampede locks, pub/sub invalidation). The standalone
 * CacheStore abstraction and its in-memory/redis implementations were removed
 * (2026-08) — the engine never used them.
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
