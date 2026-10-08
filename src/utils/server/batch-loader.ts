/**
 * @file src/utils/batch-loader.ts
 * @description
 * SveltyCMS Lean BatchLoader - A high-performance, zero-dependency alternative to the DataLoader library.
 * Designed specifically for Svelte 5 SSR and GraphQL performance optimization.
 *
 * Responsibilities include:
 * - Batching multiple individual ID lookups into a single database query.
 * - Per-request caching of results to avoid redundant fetches.
 * - Scheduling batch execution on the next microtask.
 *
 * ### Features:
 * - Constant-time lookup overhead
 * - Automatic microtask-based batching
 * - Generic type safety for keys and values
 * - Intra-batch key dedupe (DataLoader semantics: one batchFn slot per unique key)
 * - Packed, reused batch queue (no per-load entry objects, no re-allocation per batch)
 * - Allocation-lean TTL=0 hot path: the promise itself is the cache value (no
 *   per-load wrapper object) and the dispatch callback is pre-bound once
 */

export type BatchFunction<K, V> = (keys: readonly K[]) => Promise<ReadonlyArray<V | Error>>;

/** Timed cache wrapper — only used when `cacheTtlMs > 0`. */
interface TimedCacheEntry<V> {
  promise: Promise<V>;
  timestamp: number;
}

/**
 * Cache value: the bare promise when TTL is disabled (the request-scoped hot
 * path — no wrapper allocation per load), a timed wrapper when `cacheTtlMs > 0`.
 * Discriminated by the loader's `_cacheTtlMs` flag, never by value shape.
 */
type CacheValue<V> = Promise<V> | TimedCacheEntry<V>;

type ResolveFn<V> = (value: V) => void;
type RejectFn = (reason: unknown) => void;

/** Packed batch queue: each load occupies 3 slots — [key, resolve, reject]. */
type BatchQueue<K, V> = Array<K | ResolveFn<V> | RejectFn>;

const STRIDE = 3;

export class BatchLoader<K, V> {
  private _batchFn: BatchFunction<K, V>;
  private _queue: BatchQueue<K, V> = [];
  /** Previously drained queue, reused by the next batch instead of re-allocating. */
  private _pool: BatchQueue<K, V> = [];
  private _cache: Map<K, CacheValue<V>> = new Map();
  private _scheduled = false;
  private _maxBatchSize: number;
  private _cacheTtlMs: number;
  /** Pre-bound dispatch callback — one closure per loader instead of one per scheduled load. */
  private _dispatchMicrotask = () => this._dispatch();

  constructor(
    batchFn: BatchFunction<K, V>,
    options?: { maxBatchSize?: number; cacheTtlMs?: number },
  ) {
    this._batchFn = batchFn;
    this._maxBatchSize = options?.maxBatchSize ?? 100;
    this._cacheTtlMs = options?.cacheTtlMs ?? 0; // 0 = no TTL (request-scoped)
  }

  /**
   * Loads a key, returning a promise for the value.
   * If the key is already in the cache, the existing promise is returned.
   */
  public load(key: K): Promise<V> {
    // Check cache with TTL eviction
    const cached = this._cache.get(key);
    if (cached !== undefined) {
      if (this._cacheTtlMs === 0) return cached as Promise<V>;
      const entry = cached as TimedCacheEntry<V>;
      if (Date.now() - entry.timestamp < this._cacheTtlMs) return entry.promise;
      // Expired — evict
      this._cache.delete(key);
    }

    const promise = new Promise<V>((resolve, reject) => {
      this._queue.push(key, resolve, reject);
      if (!this._scheduled) {
        this._scheduled = true;
        // Immediate flush if queue exceeds max batch size
        if (this._queue.length >= this._maxBatchSize * STRIDE) {
          this._dispatch();
        } else {
          // Schedule dispatch on the next microtask
          queueMicrotask(this._dispatchMicrotask);
        }
      }
    });

    if (this._cacheTtlMs === 0) {
      this._cache.set(key, promise);
    } else {
      this._cache.set(key, { promise, timestamp: Date.now() });
    }
    return promise;
  }

  /**
   * Dispatches the queued batch.
   */
  private async _dispatch() {
    this._scheduled = false;

    // Swap the drained (reused) queue in for the next batch instead of re-allocating.
    const batch = this._queue;
    this._queue = this._pool;
    this._pool = batch;
    this._queue.length = 0;

    const entryCount = batch.length / STRIDE;

    // Intra-batch dedupe (DataLoader semantics): send each key to the batchFn once
    // and settle every duplicate caller from the same result slot.
    const uniqueKeys: K[] = [];
    const firstSlotByKey = new Map<K, number>();
    for (let i = 0; i < entryCount; i++) {
      const key = batch[i * STRIDE] as K;
      if (!firstSlotByKey.has(key)) {
        firstSlotByKey.set(key, i);
        uniqueKeys.push(key);
      }
    }

    try {
      const results = await this._batchFn(uniqueKeys);

      if (results.length !== uniqueKeys.length) {
        throw new Error(
          `BatchLoader: batchFn must return an array of the same length as the keys array. ` +
            `Expected ${uniqueKeys.length}, got ${results.length}.`,
        );
      }

      for (let i = 0; i < entryCount; i++) {
        const key = batch[i * STRIDE] as K;
        const result = results[firstSlotByKey.get(key)!];
        if (result instanceof Error) {
          (batch[i * STRIDE + 2] as RejectFn)(result);
        } else {
          (batch[i * STRIDE + 1] as ResolveFn<V>)(result);
        }
      }
    } catch (err) {
      for (let i = 0; i < entryCount; i++) {
        (batch[i * STRIDE + 2] as RejectFn)(err);
      }
    }
  }

  /**
   * Clears the value for a key from the cache.
   */
  public clear(key: K): this {
    this._cache.delete(key);
    return this;
  }

  /**
   * Clears the entire cache.
   */
  public clearAll(): this {
    this._cache.clear();
    return this;
  }

  /**
   * Prime the cache with a value.
   */
  public prime(key: K, value: V): this {
    if (!this._cache.has(key)) {
      if (this._cacheTtlMs === 0) {
        this._cache.set(key, Promise.resolve(value));
      } else {
        this._cache.set(key, { promise: Promise.resolve(value), timestamp: Date.now() });
      }
    }
    return this;
  }
}
