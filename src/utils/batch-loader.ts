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
 */

export type BatchFunction<K, V> = (
  keys: readonly K[],
) => Promise<ReadonlyArray<V | Error>>;

interface CacheEntry<V> {
  promise: Promise<V>;
  timestamp: number;
}

export class BatchLoader<K, V> {
  private _batchFn: BatchFunction<K, V>;
  private _queue: Array<{
    key: K;
    resolve: (value: V) => void;
    reject: (reason: any) => void;
  }> = [];
  private _cache: Map<K, CacheEntry<V>> = new Map();
  private _scheduled = false;
  private _maxBatchSize: number;
  private _cacheTtlMs: number;

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
    if (cached) {
      if (
        this._cacheTtlMs === 0 ||
        Date.now() - cached.timestamp < this._cacheTtlMs
      ) {
        return cached.promise;
      }
      // Expired — evict
      this._cache.delete(key);
    }

    const promise = new Promise<V>((resolve, reject) => {
      this._queue.push({ key, resolve, reject });
      if (!this._scheduled) {
        this._scheduled = true;
        // Immediate flush if queue exceeds max batch size
        if (this._queue.length >= this._maxBatchSize) {
          this._dispatch();
        } else {
          // Schedule dispatch on the next microtask
          queueMicrotask(() => this._dispatch());
        }
      }
    });

    this._cache.set(key, { promise, timestamp: Date.now() });
    return promise;
  }

  /**
   * Dispatches the queued batch.
   */
  private async _dispatch() {
    this._scheduled = false;
    const currentQueue = this._queue;
    this._queue = [];

    const keys = currentQueue.map((q) => q.key);

    try {
      const results = await this._batchFn(keys);

      if (results.length !== keys.length) {
        throw new Error(
          `BatchLoader: batchFn must return an array of the same length as the keys array. ` +
            `Expected ${keys.length}, got ${results.length}.`,
        );
      }

      currentQueue.forEach((q, i) => {
        const result = results[i];
        if (result instanceof Error) {
          q.reject(result);
        } else {
          q.resolve(result as V);
        }
      });
    } catch (err) {
      currentQueue.forEach((q) => q.reject(err));
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
      this._cache.set(key, {
        promise: Promise.resolve(value),
        timestamp: Date.now(),
      });
    }
    return this;
  }
}
