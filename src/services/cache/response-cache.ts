/**
 * @file src/services/cache/response-cache.ts
 * @description
 * High-performance pre-stringified API Response Cache service.
 * Supports synchronous L1 Map lookups (bounded, TTL-aware) + L2 cache
 * fallback with user-scoped isolation and tenant-scoped invalidation.
 *
 * ### Features:
 * - SHA-256 query hashing (no 32-bit collision space)
 * - bounded L1 (FIFO at MAX_L1_ENTRIES) with per-entry TTL
 * - tenant-scoped L1/L2 invalidation
 * - pre-computed compression variants for TURBO-HIT serving
 */

import crypto from "node:crypto";
import { cacheService } from "@src/databases/cache/cache-service";

export interface CachedResponseEntry {
  body: string;
  etag: string;
  buffer?: Uint8Array;
  /** Pre-computed compression variants (br/gzip/zstd) for TURBO-HIT serving. */
  compressed?: Record<string, Uint8Array>;
  /** L1/L2 expiration timestamp in ms — persisted so promoted entries expire too. */
  expiresAt?: number;
}

/** Module-scoped encoder (avoids per-set() allocation on hot paths). */
const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const MAX_L1_ENTRIES = 2000;

/**
 * Deterministic Content-Based ETag calculation (SHA-256 slice).
 */
export function generateContentEtag(body: string): string {
  const hash = crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

/**
 * Collision-resistant cache-key hash (SHA-256, 64 bits).
 * Replaces the former 32-bit DJB2 variant: with ~4.29e9 keys the birthday
 * bound was reached after ~77k unique queries, silently mixing distinct
 * GraphQL query results under one key. SHA-256 slice is also free of the
 * chosen-prefix weakness that rules out md5 per the security policy.
 */
export function hashStr(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
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
  let varsStr = "";
  if (typeof variables === "string" && variables.trim()) {
    try {
      varsObj = JSON.parse(variables);
    } catch {
      varsObj = {};
    }
  } else if (variables && typeof variables === "object" && variables !== null) {
    varsObj = variables as Record<string, unknown>;
  }

  if (Object.keys(varsObj).length > 0) {
    varsStr = JSON.stringify(deepSortKeys(varsObj));
  }
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
   * Bounded L1: evict the oldest entry when capacity is exceeded (FIFO —
   * cheap and sufficient for a short-TTL cache; LRU ordering would add
   * per-access bookkeeping on the hottest sync path).
   */
  private enforceL1Capacity(): void {
    if (this.localL1.size >= MAX_L1_ENTRIES) {
      const oldestKey = this.localL1.keys().next().value;
      if (oldestKey !== undefined) {
        this.localL1.delete(oldestKey);
      }
    }
  }

  /** True when the entry is missing or its TTL has elapsed. */
  private isExpired(entry: CachedResponseEntry | undefined): boolean {
    return !entry || (typeof entry.expiresAt === "number" && Date.now() > entry.expiresAt);
  }

  /**
   * Synchronous L1 lookup for pre-stringified API response.
   */
  public get(key: string, tenantId?: string | null): CachedResponseEntry | null {
    const fullKey = this.buildKey(key, tenantId);
    const local = this.localL1.get(fullKey);

    if (local) {
      if (typeof local.expiresAt === "number" && Date.now() > local.expiresAt) {
        this.localL1.delete(fullKey);
      } else {
        return local;
      }
    }

    const entry = cacheService.getSync<CachedResponseEntry>(`res:${key}`, tenantId);
    if (entry && !this.isExpired(entry)) {
      this.enforceL1Capacity();
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
    if (entry && !this.isExpired(entry)) {
      this.enforceL1Capacity();
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
    if (!entry.buffer && textEncoder) {
      entry.buffer = textEncoder.encode(entry.body);
    }
    entry.expiresAt = Date.now() + ttlMs;

    this.enforceL1Capacity();
    this.localL1.set(fullKey, entry);

    const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
    // Persist expiresAt so L2-promoted entries keep their TTL instead of
    // becoming immortal in L1 after the L2 entry expired.
    cacheService.set(
      `res:${key}`,
      { body: entry.body, etag: entry.etag, expiresAt: entry.expiresAt },
      ttlSec,
      tenantId,
    );
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
   * Clear all response cache entries in L1 memory and purge L2 cacheService
   * entries — scoped to the given tenant only (multi-tenant isolation).
   */
  public async invalidateAll(tenantId?: string | null): Promise<void> {
    const prefix = `${tenantId || "default"}:`;
    for (const k of this.localL1.keys()) {
      if (k.startsWith(prefix)) {
        this.localL1.delete(k);
      }
    }
    await cacheService.clearByPattern("res:*", tenantId || undefined);
  }

  /**
   * Invalidate response cache entries associated with a specific collection
   * mutation — scoped to the given tenant only.
   */
  public async invalidateCollection(
    collectionName: string,
    tenantId?: string | null,
  ): Promise<void> {
    const prefix = `${tenantId || "default"}:`;
    for (const k of this.localL1.keys()) {
      if (k.startsWith(prefix) && (k.includes(collectionName) || k.includes("graphql"))) {
        this.localL1.delete(k);
      }
    }
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
