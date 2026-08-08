/**
 * @file src/services/cache/response-cache.ts
 * @description
 * High-performance pre-stringified API Response Cache service.
 * Supports synchronous L1 Map lookups + L2 cache fallback with user-scoped isolation.
 */

import crypto from "node:crypto";
import { cacheService } from "@src/databases/cache/cache-service";

export interface CachedResponseEntry {
  body: string;
  etag: string;
  buffer?: Uint8Array;
}

/**
 * Deterministic Content-Based ETag calculation (SHA-256 slice).
 */
export function generateContentEtag(body: string): string {
  const hash = crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

export function hashStr(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Recursively sort object keys for deterministic JSON stringification.
 */
export function deepSortKeys(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(deepSortKeys);
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    sorted[k] = deepSortKeys(obj[k]);
  }
  return sorted;
}

export function buildGraphQLResponseCacheKey(
  query: string,
  variables?: unknown,
  publicationFilter = "all",
  userId?: unknown,
): string {
  let varsObj: Record<string, unknown> = {};
  if (typeof variables === "string" && variables.trim()) {
    try {
      varsObj = JSON.parse(variables);
    } catch {
      varsObj = {};
    }
  } else if (variables && typeof variables === "object" && variables !== null) {
    varsObj = variables as Record<string, unknown>;
  }

  const sortedObj = deepSortKeys(varsObj);
  const varsStr = JSON.stringify(sortedObj);
  const normalizedUserId = userId ? String(userId) : null;
  const queryHash = hashStr(`${query}:${varsStr}:${publicationFilter}`);
  return buildUserResponseCacheKey("/api/graphql", `?q=${queryHash}`, normalizedUserId);
}

/**
 * Single Shared User-Scoped Cache Key Builder.
 * Ensures write paths (base.ts) and read paths (handle-turbo-get.ts) use identical keys.
 */
export function buildUserResponseCacheKey(
  pathname: string,
  search: string,
  userId?: unknown,
): string {
  const userSegment = userId ? `u:${String(userId)}` : "anon";
  return `${userSegment}:${pathname}${search}`;
}

class ResponseCacheService {
  private localL1 = new Map<string, CachedResponseEntry>();

  private buildKey(key: string, tenantId?: string | null): string {
    return `${tenantId || "default"}:res:${key}`;
  }

  /**
   * Synchronous L1 lookup for pre-stringified API response.
   */
  public get(key: string, tenantId?: string | null): CachedResponseEntry | null {
    const fullKey = this.buildKey(key, tenantId);
    const local = this.localL1.get(fullKey);
    if (local) return local;

    const entry = cacheService.getSync<CachedResponseEntry>(`res:${key}`, tenantId);
    if (entry) {
      this.localL1.set(fullKey, entry);
      return entry;
    }
    return null;
  }

  /**
   * Asynchronous L2 + L1 lookup.
   */
  public async getAsync(
    key: string,
    tenantId?: string | null,
  ): Promise<CachedResponseEntry | null> {
    const syncRes = this.get(key, tenantId);
    if (syncRes) return syncRes;

    const entry = await cacheService.get<CachedResponseEntry>(`res:${key}`, tenantId);
    if (entry) {
      this.localL1.set(this.buildKey(key, tenantId), entry);
      return entry;
    }
    return null;
  }

  /**
   * Cache pre-stringified response tuple with user scoping.
   */
  public set(
    key: string,
    entry: CachedResponseEntry,
    ttlMs: number = 300_000,
    tenantId?: string | null,
  ): void {
    const fullKey = this.buildKey(key, tenantId);
    if (!entry.buffer && typeof TextEncoder !== "undefined") {
      entry.buffer = new TextEncoder().encode(entry.body);
    }
    this.localL1.set(fullKey, entry);

    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    cacheService.set(`res:${key}`, { body: entry.body, etag: entry.etag }, ttlSec, tenantId);
  }

  /**
   * Invalidate response entries matching specific tags or keys.
   */
  public async invalidate(key: string, tenantId?: string | null): Promise<void> {
    const fullKey = this.buildKey(key, tenantId);
    this.localL1.delete(fullKey);
    await cacheService.delete(`res:${key}`, tenantId);
  }

  /**
   * Clear all response cache entries in L1 memory and purge L2/L1 cacheService entries.
   */
  public async invalidateAll(tenantId?: string | null): Promise<void> {
    this.localL1.clear();
    await cacheService.clearByPattern("res:*", tenantId || undefined);
  }

  /**
   * Invalidate response cache entries associated with a specific collection mutation.
   */
  public async invalidateCollection(
    collectionName: string,
    tenantId?: string | null,
  ): Promise<void> {
    this.localL1.clear();
    await cacheService.clearByPattern(`res:*${collectionName}*`, tenantId || undefined);
    await cacheService.clearByPattern("res:*graphql*", tenantId || undefined);
  }

  /**
   * Clear local in-memory Map and purge L2 cacheService entries.
   */
  public async clearLocal(): Promise<void> {
    this.localL1.clear();
    await cacheService.clearByPattern("res:*");
  }
}

export const responseCache = new ResponseCacheService();
