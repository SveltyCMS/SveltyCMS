/**
 * @file src/services/cache/response-cache.ts
 * @description
 * High-performance pre-stringified API Response Cache service.
 * Supports synchronous L1 Map lookups (bounded, TTL-aware) + L2 cache
 * fallback with user-scoped isolation and tenant-scoped invalidation.
 *
 * ### Features:
 * - FNV-1a 64-bit query hashing (zero-allocation, no 32-bit collision space)
 * - bounded L1 (FIFO at MAX_L1_ENTRIES) with per-entry TTL
 * - tenant-scoped L1/L2 invalidation
 * - pre-computed compression variants for TURBO-HIT serving
 */

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
 * Exact FNV-1a 64-bit hash over UTF-16 code units, rendered as 16 lowercase
 * hex chars. Emulated with two 32-bit lanes (offset basis 0xcbf29ce484222325,
 * prime 0x100000001b3 = 0x100 * 2^32 + 0x1b3) so the multiply step stays
 * within the safe-integer range — no BigInt, no allocations per character.
 *
 * Non-security cache discriminator only (HTTP ETags / GraphQL cache keys) —
 * never applied to secrets, tokens, or passwords.
 */
function fnv1a64Hex(input: string): string {
  const FNV_PRIME_LO = 0x1b3; // low 32 bits of the FNV-1a 64-bit prime
  const FNV_PRIME_HI = 0x100; // high 32 bits of the FNV-1a 64-bit prime
  const TWO_32 = 0x100000000; // 2^32 (exact float divisor)
  let hi = 0xcbf29ce4; // offset basis high lane
  let lo = 0x84222325; // offset basis low lane

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // Fold the code unit two bytes at a time (low, then high).
    lo = (lo ^ (code & 0xff)) >>> 0;
    const m1 = lo * FNV_PRIME_LO; // < 2^41, exact
    const lo1 = m1 >>> 0; // low 32 bits
    const carry1 = (m1 - lo1) / TWO_32;
    hi = (hi * FNV_PRIME_LO + lo * FNV_PRIME_HI + carry1) >>> 0;
    lo = lo1;

    lo = (lo ^ (code >>> 8)) >>> 0;
    const m2 = lo * FNV_PRIME_LO;
    const lo2 = m2 >>> 0;
    const carry2 = (m2 - lo2) / TWO_32;
    hi = (hi * FNV_PRIME_LO + lo * FNV_PRIME_HI + carry2) >>> 0;
    lo = lo2;
  }

  return hi.toString(16).padStart(8, "0") + lo.toString(16).padStart(8, "0");
}

/**
 * Deterministic Content-Based ETag calculation (FNV-1a 64-bit, quoted 16 hex).
 */
export function generateContentEtag(body: string): string {
  return `"${fnv1a64Hex(body)}"`;
}

/**
 * Fast cache-key hash (FNV-1a 64-bit, 16 lowercase hex chars).
 *
 * Replaces the former SHA-256 slice: the 64-bit output keeps the same
 * collision space as before while being allocation-free on hot GraphQL
 * cache-key paths. Feeds response-cache keys only — never secrets or tokens.
 */
export function hashStr(s: string): string {
  return fnv1a64Hex(s);
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
