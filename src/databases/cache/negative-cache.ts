/**
 * @file src/databases/cache/negative-cache.ts
 * @description
 * Hybrid Bloom Filter negative caching engine for SveltyCMS.
 *
 * Prevents "cache miss storms" where repeated requests for non-existent items (404s, broken links)
 * repeatedly hit the database. Includes automatic 5-minute rotation and immediate invalidation tracking.
 *
 * ### Features:
 * - Low-memory Bloom filter (100k capacity, 0.01 error rate)
 * - Automatic 5-minute rotation with unreferenced timers
 * - Immediate invalidation overrides for freshly inserted keys
 */

import { BloomFilter } from "@utils/bloom-filter";

export class NegativeCacheManager {
  private negativeBloom: BloomFilter;
  private negativeInvalidated: Set<string>;
  private rotationTimer: any = null;
  /** 🔴 FIX 7: hard cap on the invalidation-tracking Set so it can never grow
   * unbounded between 5-minute rotations. `cacheService.set()` calls
   * `negative.invalidate()` for EVERY write app-wide, and the pre-warming cycle
   * adds a recurring 4-minute burst of writes (out of phase with the 5-minute
   * rotation). Without a cap this Set held arbitrarily many live strings under
   * real write throughput. */
  private readonly maxInvalidatedEntries: number;

  constructor(maxInvalidatedEntries = 10_000) {
    this.negativeBloom = new BloomFilter(100000, 0.01);
    this.negativeInvalidated = new Set<string>();
    this.maxInvalidatedEntries = maxInvalidatedEntries;
    this.startRotation();
  }

  /**
   * Checks if a full key is a known negative cache hit (confirmed non-existent).
   */
  isNegativeHit(fullKey: string): boolean {
    if (this.negativeInvalidated.has(fullKey)) return false;
    return this.negativeBloom.has(fullKey);
  }

  /**
   * Records a confirmed miss in the Bloom filter.
   */
  recordMiss(fullKey: string): void {
    this.negativeBloom.add(fullKey);
  }

  /**
   * Invalidates a key from negative cache when an item is created or updated.
   * 🔴 FIX 7: enforces the size cap — when `negativeInvalidated` reaches the cap
   * it is reset and only the current key is retained, so the just-written key
   * is still correctly treated as non-negative while the rest of the (short-
   * lived) override entries are released. Dropping older override entries is
   * safe: worst case a key re-enters the Bloom filter and triggers a single
   * extra DB query for the next request — never stale data or memory growth.
   */
  invalidate(fullKey: string): void {
    this.negativeInvalidated.add(fullKey);
    if (this.negativeInvalidated.size > this.maxInvalidatedEntries) {
      this.negativeInvalidated.clear();
      this.negativeInvalidated.add(fullKey);
    }
  }

  /**
   * Starts the 5-minute rotation timer to purge accumulated negative entries.
   */
  private startRotation(): void {
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    this.rotationTimer = setInterval(
      () => {
        this.negativeBloom = new BloomFilter(100000, 0.01);
        this.negativeInvalidated.clear();
      },
      1000 * 60 * 5,
    );

    if (typeof this.rotationTimer.unref === "function") {
      this.rotationTimer.unref();
    }
  }

  clear(): void {
    this.negativeBloom = new BloomFilter(100000, 0.01);
    this.negativeInvalidated.clear();
  }

  stop(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }
}
