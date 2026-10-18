/**
 * @file src/databases/cache/negative-cache.ts
 * @description
 * Hybrid Bloom Filter negative caching engine for SveltyCMS.
 *
 * Prevents "cache miss storms" where repeated requests for non-existent items (404s, broken links)
 * repeatedly hit the database. Includes automatic 5-minute rotation and immediate invalidation tracking.
 *
 * ### Features:
 * - Low-memory Bloom filter (100k capacity, 0.01 error rate) as a cheap "definitely not negative" prefilter
 * - Bounded exact TTL map makes Bloom positives authoritative (no 1 % false-positive 404s)
 * - Tag-scoped invalidation (`doc:<collection>:<id>`) so a create/update immediately un-negatives a key
 * - Automatic 5-minute rotation with unreferenced timers
 * - Immediate invalidation overrides for freshly inserted keys
 */

import { BloomFilter } from "@utils/bloom-filter";

interface NegativeEntry {
  expiresAt: number;
  tags?: readonly string[];
}

export interface NegativeCacheOptions {
  /** Hard cap on the invalidation-tracking Set. */
  maxInvalidatedEntries?: number;
  /** Hard cap on the exact negative map (default 20 000). */
  maxExactEntries?: number;
  /** How long an exact negative entry stays authoritative (default 60 000 ms). */
  exactTtlMs?: number;
}

export class NegativeCacheManager {
  private negativeBloom: BloomFilter;
  private negativeInvalidated: Set<string>;
  private rotationTimer: any = null;
  private missCount = 0;
  /** Exact-key authority behind the Bloom prefilter. Bloom cannot delete keys,
   * so a rotated/invalidated key would otherwise stay "negative" until the
   * filter itself is cleared. */
  private readonly exact = new Map<string, NegativeEntry>();
  /** Reverse index (tag → keys) so a write-path `clearByTags()` is O(tags)
   * instead of a 20k-entry scan on every mutation. */
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly exactTtlMs: number;
  private readonly maxExactEntries: number;
  /** 🔴 FIX 7: hard cap on the invalidation-tracking Set so it can never grow
   * unbounded between 5-minute rotations. `cacheService.set()` calls
   * `negative.invalidate()` for EVERY write app-wide, and the pre-warming cycle
   * adds a recurring 4-minute burst of writes (out of phase with the 5-minute
   * rotation). Without a cap this Set held arbitrarily many live strings under
   * real write throughput. */
  private readonly maxInvalidatedEntries: number;

  constructor(options: NegativeCacheOptions | number = {}) {
    // Back-compat: the historical constructor took the invalidation cap directly.
    const opts = typeof options === "number" ? { maxInvalidatedEntries: options } : options;
    this.negativeBloom = new BloomFilter(100000, 0.01);
    this.negativeInvalidated = new Set<string>();
    this.maxInvalidatedEntries = opts.maxInvalidatedEntries ?? 10_000;
    this.maxExactEntries = Math.max(1, opts.maxExactEntries ?? 20_000);
    this.exactTtlMs = Math.max(1, opts.exactTtlMs ?? 60_000);
    this.startRotation();
  }

  /**
   * Checks if a full key is a known negative cache hit (confirmed non-existent).
   * 🚀 Fast path: when missCount is 0, skips all Bloom hashing and Set checks.
   */
  isNegativeHit(fullKey: string): boolean {
    if (this.missCount === 0) return false;
    if (this.negativeInvalidated.size > 0 && this.negativeInvalidated.has(fullKey)) return false;
    if (!this.negativeBloom.has(fullKey)) return false;
    const entry = this.exact.get(fullKey);
    if (!entry) return false;
    if (entry.expiresAt <= Date.now()) {
      this.deleteExact(fullKey);
      return false;
    }
    return true;
  }

  /**
   * Records a confirmed miss in the Bloom filter and the exact map.
   * `tags` lets a later write invalidate the entry (`clearByTags`).
   */
  recordMiss(fullKey: string, tags?: readonly string[]): void {
    this.missCount++;
    this.negativeBloom.add(fullKey);
    if (this.exact.size >= this.maxExactEntries) this.pruneExact();
    this.exact.set(fullKey, {
      expiresAt: Date.now() + this.exactTtlMs,
      tags,
    });
    if (tags) {
      for (const tag of tags) {
        let bucket = this.tagIndex.get(tag);
        if (!bucket) {
          bucket = new Set();
          this.tagIndex.set(tag, bucket);
        }
        bucket.add(fullKey);
      }
    }
  }

  /**
   * Invalidates a key from negative cache when an item is created or updated.
   * 🚀 Fast path: when missCount is 0, no items exist in Bloom filter so invalidation is a no-op.
   */
  invalidate(fullKey: string): void {
    if (this.missCount === 0) return;
    this.deleteExact(fullKey);
    this.negativeInvalidated.add(fullKey);
    if (this.negativeInvalidated.size > this.maxInvalidatedEntries) {
      this.negativeInvalidated.clear();
      this.negativeInvalidated.add(fullKey);
    }
  }

  /** Removes an exact entry and its reverse-index memberships. */
  private deleteExact(fullKey: string): void {
    const entry = this.exact.get(fullKey);
    if (!entry) return;
    this.exact.delete(fullKey);
    if (!entry.tags) return;
    for (const tag of entry.tags) {
      const bucket = this.tagIndex.get(tag);
      if (!bucket) continue;
      bucket.delete(fullKey);
      if (bucket.size === 0) this.tagIndex.delete(tag);
    }
  }

  /**
   * Invalidates every exact negative carrying one of `tags` (e.g. the per-doc
   * cache tag used by write invalidation). Bloom bits stay set — the exact map
   * is authoritative, so a stale bit is harmless.
   */
  invalidateByTags(tags: readonly string[]): void {
    if (this.exact.size === 0 || tags.length === 0) return;
    for (const tag of tags) {
      const bucket = this.tagIndex.get(tag);
      if (!bucket || bucket.size === 0) continue;
      // Snapshot: `invalidate` mutates the bucket while we walk it.
      for (const key of Array.from(bucket)) this.invalidate(key);
    }
  }

  /**
   * Invalidates every exact negative whose key starts with `prefix`
   * (used by tenant/collection-scoped pattern clears).
   */
  invalidateByPrefix(prefix: string): void {
    if (this.exact.size === 0) return;
    if (prefix === "") {
      this.clear();
      return;
    }
    let matched: string[] | null = null;
    for (const key of this.exact.keys()) {
      if (key.startsWith(prefix)) (matched ??= []).push(key);
    }
    if (!matched) return;
    for (const key of matched) this.invalidate(key);
  }

  /** Drops expired entries, then oldest-insertion-order entries until below 90 %. */
  private pruneExact(): void {
    const now = Date.now();
    for (const [key, entry] of this.exact) {
      if (entry.expiresAt <= now) this.deleteExact(key);
    }
    if (this.exact.size < this.maxExactEntries) return;
    const target = Math.floor(this.maxExactEntries * 0.9);
    for (const key of this.exact.keys()) {
      if (this.exact.size <= target) break;
      this.deleteExact(key);
    }
  }

  /**
   * Starts the 5-minute rotation timer to purge accumulated negative entries.
   * 🚀 Reuses the existing BloomFilter instance and typed array in-place via clear().
   */
  private startRotation(): void {
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    this.rotationTimer = setInterval(
      () => {
        this.negativeBloom.clear();
        this.negativeInvalidated.clear();
        this.exact.clear();
        this.tagIndex.clear();
        this.missCount = 0;
      },
      1000 * 60 * 5,
    );

    if (typeof this.rotationTimer.unref === "function") {
      this.rotationTimer.unref();
    }
  }

  clear(): void {
    this.negativeBloom.clear();
    this.negativeInvalidated.clear();
    this.exact.clear();
    this.tagIndex.clear();
    this.missCount = 0;
  }

  stop(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }
}
